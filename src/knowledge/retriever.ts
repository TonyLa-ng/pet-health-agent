// ============================================
// Knowledge Retriever — M1 检索器 (v2.0)
// 同义词扩展 → 加权关键词匹配 → 余弦相似度 → 物种过滤
// v2.0: 新增 searchVerified() — 接受 VerifiedTerm[] 带权重检索
// ============================================

import type { KnowledgeEntry, SearchResult, VerifiedTerm } from './types'
import {
  loadAllKnowledge,
  loadSynonyms,
  loadSpeciesConfig,
} from './loader'
import type { SynonymTable } from './loader'

/**
 * 检索知识库（兼容接口）
 *
 * 将 string[] 包装为默认权重的 VerifiedTerm[] 后委托 searchVerified()
 *
 * @param symptoms - 标准化后的症状名称数组
 * @param species - 目标物种
 * @returns 按相似度降序排列的检索结果
 */
export function search(
  symptoms: string[],
  species: '犬' | '猫' | '兔' | '仓鼠'
): SearchResult[] {
  // 包装为默认权重的 VerifiedTerm
  const verifiedTerms: VerifiedTerm[] = symptoms.map((s) => ({
    term: s,
    canonicalForm: s,
    confidence: 1.0, // 兼容路径：规则引擎已做初步标准化，给满分
    source: 'exact',
  }))
  return searchVerified(verifiedTerms, species)
}

/**
 * 带验证权重的 RAG 检索（v2.0 新增）
 *
 * 与 search() 的区别：
 *   - 接受经验证的 VerifiedTerm[]，每个词带有验证置信度
 *   - 匹配分数乘以 verification confidence 作为权重修正
 *   - 同义词扩展时会考虑 verifiedTerm.canonicalForm 而非原始输入
 *
 * @param verifiedTerms - 经验证的关键词列表（来自 normalization-verifier）
 * @param species - 目标物种
 * @returns 按相似度降序排列的检索结果
 */
export function searchVerified(
  verifiedTerms: VerifiedTerm[],
  species: '犬' | '猫' | '兔' | '仓鼠'
): SearchResult[] {
  if (verifiedTerms.length === 0) return []

  // 1. 构建加权症状映射：canonicalForm → weight
  //    weight 基于 verification confidence，精确匹配=1.0，同义词=0.9，模糊=0.7
  const symptomWeights = new Map<string, number>()
  for (const vt of verifiedTerms) {
    const existing = symptomWeights.get(vt.canonicalForm)
    // 保留最高权重
    if (existing === undefined || vt.confidence > existing) {
      symptomWeights.set(vt.canonicalForm, vt.confidence)
    }
  }

  const canonicalForms = Array.from(symptomWeights.keys())

  // 2. 同义词扩展
  const synonymTable = loadSynonyms(species)
  const expandedSymptoms = expandSymptoms(canonicalForms, synonymTable)

  // 3. 加载目标物种知识库
  const entries = loadAllKnowledge(species)

  // 4. 计算加权匹配分数
  const scored = entries.map((entry) => {
    const { score, symptomOverlap, primaryHitRate } = computeMatchScoreWeighted(
      expandedSymptoms,
      entry,
      symptomWeights
    )
    return { entry, score, symptomOverlap, primaryHitRate }
  })

  // 5. 过滤：低于召回阈值的排除
  const MIN_SIMILARITY = 0.25
  const filtered = scored.filter((s) => s.score >= MIN_SIMILARITY)

  // 6. 按分数降序排序
  filtered.sort((a, b) => b.score - a.score)

  // 7. 最多返回 Top 10
  const top10 = filtered.slice(0, 10)

  // 8. 如果目标物种有效召回 < 3 条，尝试跨物种兜底
  if (top10.length < 3) {
    const config = loadSpeciesConfig(species)
    if (config.allow_cross_species_search) {
      const crossResults = crossSpeciesSearchWeighted(
        expandedSymptoms,
        species,
        top10.map((r) => r.entry.id),
        symptomWeights
      )
      top10.push(...crossResults)
      top10.sort((a, b) => b.score - a.score)
    }
  }

  return top10.slice(0, 10).map((r) => ({
    entry: r.entry,
    score: Math.round(r.score * 100) / 100,
    matchDetails: {
      symptomOverlap: r.symptomOverlap,
      primaryHitRate: Math.round(r.primaryHitRate * 100) / 100,
      isCrossSpecies: !r.entry.species.includes(species),
    },
  }))
}

/**
 * 同义词扩展：将输入的每个症状映射为其全部同义词
 */
function expandSymptoms(
  symptoms: string[],
  synonymTable: SynonymTable
): string[] {
  const expanded = new Set<string>()

  for (const symptom of symptoms) {
    // 原始词
    expanded.add(symptom)

    // 查找同义词
    for (const [standardTerm, synonyms] of Object.entries(
      synonymTable.mappings
    )) {
      // 如果输入症状是标准术语
      if (symptom === standardTerm) {
        expanded.add(standardTerm)
        for (const syn of synonyms) {
          expanded.add(syn)
        }
      }
      // 如果输入症状是同义词
      if (synonyms.includes(symptom)) {
        expanded.add(standardTerm)
        for (const syn of synonyms) {
          expanded.add(syn)
        }
      }
    }
  }

  return Array.from(expanded)
}

/**
 * 加权版匹配分数计算（v2.0 新增）
 *
 * 与 computeMatchScore 的区别：
 *   - 每个查询词带有 verification weight
 *   - 命中时乘以该词的 weight，提升高置信度匹配的贡献
 */
function computeMatchScoreWeighted(
  expandedQuery: string[],
  entry: KnowledgeEntry,
  symptomWeights: Map<string, number>
): { score: number; symptomOverlap: number; primaryHitRate: number } {
  const allPrimaries = entry.symptoms.primary
  const allSecondaries = entry.symptoms.secondary

  // 加权主要症状命中
  let primaryWeightedHits = 0
  let primaryTotalWeight = 0
  for (const primary of allPrimaries) {
    let maxWeight = 0
    for (const q of expandedQuery) {
      if (isSymptomMatch(q, primary)) {
        const w = symptomWeights.get(q) ?? 0.8
        if (w > maxWeight) maxWeight = w
      }
    }
    primaryWeightedHits += maxWeight
    primaryTotalWeight += 1.0
  }

  // 加权次要症状命中
  let secondaryWeightedHits = 0
  let discriminativeSecondaryHits = 0
  for (const secondary of allSecondaries) {
    for (const q of expandedQuery) {
      if (isSymptomMatch(q, secondary)) {
        const w = symptomWeights.get(q) ?? 0.8
        secondaryWeightedHits += w
        if (isDiscriminativeSymptom(secondary)) discriminativeSecondaryHits++
        break // 一个次要症状只计一次
      }
    }
  }

  const primaryDenominator = Math.min(Math.max(primaryTotalWeight, 1), 3)
  const primaryHitRate =
    primaryTotalWeight > 0 ? Math.min(1, primaryWeightedHits / primaryDenominator) : 0
  const secondaryBonus = Math.min(1.0, secondaryWeightedHits / 3)

  // 知识库置信度修正
  const confidenceMultiplier =
    entry.confidence === 'high' ? 1.0 : entry.confidence === 'medium' ? 0.7 : 0.4

  let score: number
  if (primaryWeightedHits > 0) {
    score = primaryHitRate * 0.85 + secondaryBonus * 0.15
  } else {
    score = secondaryBonus * 0.2
  }

  score = applyUrgencyBoost(score, entry, primaryWeightedHits, secondaryWeightedHits)
  score = applyDiscriminativeBoost(score, discriminativeSecondaryHits)
  score = Math.min(score * confidenceMultiplier, 1.0)

  // 计算非加权的 symptomOverlap（用于展示）
  let rawPrimaryHits = 0
  let rawSecondaryHits = 0
  for (const primary of allPrimaries) {
    if (expandedQuery.some((q) => isSymptomMatch(q, primary))) rawPrimaryHits++
  }
  for (const secondary of allSecondaries) {
    if (expandedQuery.some((q) => isSymptomMatch(q, secondary)))
      rawSecondaryHits++
  }

  return {
    score,
    symptomOverlap: rawPrimaryHits + rawSecondaryHits,
    primaryHitRate,
  }
}

/**
 * 加权版跨物种检索（v2.0 新增）
 */
function crossSpeciesSearchWeighted(
  expandedSymptoms: string[],
  originalSpecies: string,
  excludeIds: string[],
  symptomWeights: Map<string, number>
): Array<{ entry: KnowledgeEntry; score: number; symptomOverlap: number; primaryHitRate: number }> {
  const crossSpecies = originalSpecies === '犬' ? ('猫' as const) : ('犬' as const)
  const entries = loadAllKnowledge(crossSpecies)

  const results = entries
    .filter((e) => !excludeIds.includes(e.id))
    .map((entry) => {
      const { score, symptomOverlap, primaryHitRate } = computeMatchScoreWeighted(
        expandedSymptoms,
        entry,
        symptomWeights
      )
      return { entry, score: score * 0.5, symptomOverlap, primaryHitRate }
    })
    .filter((r) => r.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  return results
}

/**
 * 模糊匹配两个症状词
 */
function isSymptomMatch(queryWord: string, targetSymptom: string): boolean {
  const q = queryWord.toLowerCase().trim()
  const t = targetSymptom.toLowerCase().trim()

  if (q === t) return true
  if (q.length >= 2 && t.length >= 2 && (q.includes(t) || t.includes(q))) return true

  if (!canUseFuzzySymptomMatch(q, t)) return false

  // 编辑距离 ≤ 1 的容错匹配（处理错别字）
  return editDistance(q, t) <= 1
}

function applyUrgencyBoost(
  score: number,
  entry: KnowledgeEntry,
  primaryHits: number,
  secondaryHits: number
): number {
  if ((entry.urgency === 'critical' || entry.urgency === 'high') &&
    primaryHits >= 1 &&
    primaryHits + secondaryHits >= 3) {
    const boosted = Math.min(1, score + (entry.urgency === 'critical' ? 0.06 : 0.03))
    if (entry.urgency === 'critical' && secondaryHits >= 2) {
      return Math.max(boosted, 0.68)
    }
    return boosted
  }
  return score
}

function applyDiscriminativeBoost(score: number, discriminativeSecondaryHits: number): number {
  if (discriminativeSecondaryHits <= 0) return score
  return Math.min(1, score + Math.min(0.15, discriminativeSecondaryHits * 0.12))
}

function isDiscriminativeSymptom(symptom: string): boolean {
  return /弓背|祈祷|少尿|无尿|尿不出|腹部急剧胀大|腹部胀大|干呕|吐不出|休克|虚脱|牙龈苍白|黑便|咖啡渣|血便|黄疸|口腔溃疡|呼吸困难|张口呼吸|抽搐/.test(symptom)
}

function canUseFuzzySymptomMatch(queryWord: string, targetSymptom: string): boolean {
  const minLength = Math.min(queryWord.length, targetSymptom.length)
  if (minLength < 4) return false

  // 两个很短的中文词一字之差常常是完全不同症状，例如“腹痛”和“腹泻”。
  if (isMostlyCjk(queryWord) && isMostlyCjk(targetSymptom) && minLength <= 4) {
    return false
  }

  return true
}

function isMostlyCjk(value: string): boolean {
  const cjkCount = Array.from(value).filter((char) => /[\u4e00-\u9fff]/.test(char)).length
  return cjkCount / Math.max(1, value.length) >= 0.6
}

/**
 * 编辑距离计算
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
