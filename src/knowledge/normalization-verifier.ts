// ============================================
// Normalization Verifier — RAG 优化：关键词归一化检验
// 将 LLM/规则提取的关键词对照 KB 词汇表验证，
// 输出带置信度的 VerifiedTerm[] 供 RAG 检索使用
// ============================================

import type { VerifiedTerm, VerificationResult, VerificationSource } from './types'
import { loadSynonyms, loadAllKnowledge } from './loader'
import type { SynonymTable } from './loader'

/** 词汇索引缓存（按物种） */
const vocabCache = new Map<string, VocabularyIndex>()

/** KB 词汇索引结构 */
interface VocabularyIndex {
  /** standardTerm → Set<synonym> */
  synonymIndex: Map<string, Set<string>>
  /** synonym → standardTerm 反向索引 */
  reverseSynonymIndex: Map<string, string>
  /** 所有 KB 症状术语（主要+次要） */
  symptomTerms: Set<string>
  /** 所有疾病名称 */
  diseaseNames: Set<string>
  /** 所有标准化术语（用于模糊匹配） */
  allStandardTerms: string[]
  /** 物种 */
  species: string
}

// ============================================================
// 词汇索引构建
// ============================================================

/**
 * 构建指定物种的 KB 词汇索引（带缓存）
 */
function buildVocabularyIndex(species: string): VocabularyIndex {
  const cacheKey = species
  const cached = vocabCache.get(cacheKey)
  if (cached) return cached

  const synonymTable = loadSynonyms(species as '犬' | '猫' | '兔' | '仓鼠')
  const entries = loadAllKnowledge(species as '犬' | '猫' | '兔' | '仓鼠')

  // 构建同义词索引
  const synonymIndex = new Map<string, Set<string>>()
  const reverseSynonymIndex = new Map<string, string>()
  const allStandardTerms: string[] = []

  for (const [standardTerm, synonyms] of Object.entries(synonymTable.mappings)) {
    const synSet = new Set(synonyms)
    synonymIndex.set(standardTerm, synSet)
    allStandardTerms.push(standardTerm)

    // 反向索引
    reverseSynonymIndex.set(standardTerm, standardTerm)
    for (const syn of synonyms) {
      reverseSynonymIndex.set(syn, standardTerm)
      // v2.1: 将同义词 value 也纳入 allStandardTerms，使模糊匹配可以命中
      // 例如 "红印子" → fuzzy → "红斑"(synonym value) → 皮肤异常
      allStandardTerms.push(syn)
    }
  }

  // 收集所有 KB 症状术语
  const symptomTerms = new Set<string>()
  const diseaseNames = new Set<string>()

  for (const entry of entries) {
    for (const p of entry.symptoms.primary) {
      symptomTerms.add(p)
      // 也将同义词加入
      const syns = synonymIndex.get(p)
      if (syns) {
        for (const s of syns) symptomTerms.add(s)
      }
    }
    for (const s of entry.symptoms.secondary) {
      symptomTerms.add(s)
      const syns = synonymIndex.get(s)
      if (syns) {
        for (const syn of syns) symptomTerms.add(syn)
      }
    }
    diseaseNames.add(entry.disease)
  }

  const index: VocabularyIndex = {
    synonymIndex,
    reverseSynonymIndex,
    symptomTerms,
    diseaseNames,
    allStandardTerms,
    species,
  }

  vocabCache.set(cacheKey, index)
  return index
}

// ============================================================
// 关键词验证
// ============================================================

/**
 * 验证关键词列表，返回带置信度的 VerifiedTerm[]
 *
 * 验证策略（四级降级）：
 *   1. 精确匹配标准术语          → confidence=1.0, source='exact'
 *   2. 同义词映射到标准术语      → confidence=0.9, source='synonym'
 *   3. 模糊匹配（编辑距离≤2）    → confidence=0.7, source='fuzzy'
 *   4. 无法匹配                  → 归入 unmappedTerms
 *
 * @param keywords - 待验证的关键词列表
 * @param species - 目标物种
 * @returns VerificationResult
 */
export function verifyKeywords(
  keywords: string[],
  species: '犬' | '猫' | '兔' | '仓鼠'
): VerificationResult {
  if (keywords.length === 0) {
    return { verifiedTerms: [], unmappedTerms: [], coverage: 0 }
  }

  const index = buildVocabularyIndex(species)
  const verifiedTerms: VerifiedTerm[] = []
  const unmappedTerms: string[] = []

  for (const kw of keywords) {
    const cleaned = kw.trim()
    if (!cleaned) continue

    const result = verifyOneKeyword(cleaned, index)
    if (result) {
      // 去重：同一 canonicalForm 只保留最高置信度的
      const existing = verifiedTerms.find(
        (v) => v.canonicalForm === result.canonicalForm
      )
      if (existing) {
        if (result.confidence > existing.confidence) {
          existing.term = result.term
          existing.confidence = result.confidence
          existing.source = result.source
        }
      } else {
        verifiedTerms.push(result)
      }
    } else {
      unmappedTerms.push(cleaned)
    }
  }

  const coverage =
    verifiedTerms.length / (verifiedTerms.length + unmappedTerms.length)

  // 覆盖率过低时生成重试提示
  let suggestionForRetry: string | undefined
  if (coverage < 0.3 && unmappedTerms.length > 0) {
    const availableCategories = [
      ...new Set(
        Array.from(index.symptomTerms).slice(0, 20)
      ),
    ]
    suggestionForRetry =
      `关键词覆盖率仅 ${Math.round(coverage * 100)}%，` +
      `以下词汇无法在知识库中匹配：${unmappedTerms.join('、')}。` +
      `可用词汇类别包括：${availableCategories.join('、')}等。` +
      `请使用更接近标准兽医术语的关键词重新提取。`
  }

  return {
    verifiedTerms,
    unmappedTerms,
    coverage: Math.round(coverage * 100) / 100,
    suggestionForRetry,
  }
}

/**
 * 验证单个关键词
 */
function verifyOneKeyword(
  keyword: string,
  index: VocabularyIndex
): VerifiedTerm | null {
  const lower = keyword.toLowerCase().trim()

  // Level 1: 精确匹配标准术语（在 reverseSynonymIndex 中作为 key 存在）
  const exactCanonical = index.reverseSynonymIndex.get(keyword)
  if (exactCanonical && exactCanonical === keyword) {
    return {
      term: keyword,
      canonicalForm: exactCanonical,
      confidence: 1.0,
      source: 'exact',
    }
  }

  // Level 2: 同义词映射
  if (exactCanonical) {
    return {
      term: keyword,
      canonicalForm: exactCanonical,
      confidence: 0.9,
      source: 'synonym',
    }
  }

  // Level 2.5: 精确匹配 KB 症状术语（可能在症状列表但不在同义词表中）
  if (index.symptomTerms.has(keyword)) {
    return {
      term: keyword,
      canonicalForm: keyword,
      confidence: 0.95,
      source: 'exact',
    }
  }

  // 大小写不敏感匹配
  for (const term of index.allStandardTerms) {
    if (term.toLowerCase() === lower) {
      return {
        term: keyword,
        canonicalForm: term,
        confidence: 0.95,
        source: 'exact',
      }
    }
  }

  // 大小写不敏感同义词匹配
  for (const [standard, synonyms] of index.synonymIndex) {
    for (const syn of synonyms) {
      if (syn.toLowerCase() === lower) {
        return {
          term: keyword,
          canonicalForm: standard,
          confidence: 0.9,
          source: 'synonym',
        }
      }
    }
  }

  // Level 3: 模糊匹配（编辑距离 ≤ 2）
  let bestFuzzyMatch: { term: string; distance: number } | null = null
  for (const standardTerm of index.allStandardTerms) {
    const distance = editDistance(lower, standardTerm.toLowerCase())
    if (distance <= 2 && distance < (bestFuzzyMatch?.distance ?? Infinity)) {
      bestFuzzyMatch = { term: standardTerm, distance }
    }
  }
  if (bestFuzzyMatch) {
    return {
      term: keyword,
      canonicalForm: bestFuzzyMatch.term,
      confidence: bestFuzzyMatch.distance === 1 ? 0.75 : 0.65,
      source: 'fuzzy',
    }
  }

  // 也尝试模糊匹配同义词
  for (const [standard, synonyms] of index.synonymIndex) {
    for (const syn of synonyms) {
      const distance = editDistance(lower, syn.toLowerCase())
      if (distance <= 2 && distance < (bestFuzzyMatch?.distance ?? Infinity)) {
        bestFuzzyMatch = { term: standard, distance }
      }
    }
  }
  if (bestFuzzyMatch && bestFuzzyMatch.distance <= 2) {
    return {
      term: keyword,
      canonicalForm: bestFuzzyMatch.term,
      confidence: bestFuzzyMatch.distance === 1 ? 0.7 : 0.6,
      source: 'fuzzy',
    }
  }

  return null
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 编辑距离计算（Levenshtein）
 */
function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[a.length][b.length]
}

/**
 * 清除词汇索引缓存（测试用）
 */
export function clearVocabCache(): void {
  vocabCache.clear()
}

/**
 * 获取 KB 词汇统计信息（调试/监控用）
 */
export function getVocabStats(species: '犬' | '猫' | '兔' | '仓鼠'): {
  standardTerms: number
  symptomTerms: number
  diseaseNames: number
} {
  const index = buildVocabularyIndex(species)
  return {
    standardTerms: index.allStandardTerms.length,
    symptomTerms: index.symptomTerms.size,
    diseaseNames: index.diseaseNames.size,
  }
}
