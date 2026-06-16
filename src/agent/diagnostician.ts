// ============================================
// M5: Diagnostic Engine (诊断引擎) v3.0
// 四层优化: 行业强约束Prompt + 症状拆解器 + RAG增强 + 幻觉控制
// ============================================

import type { RawDiagnosis, NormalizedInput, DiagnosisSource } from './types'
import { search, searchVerified } from '@/knowledge/retriever'
import type { SearchResult, VerifiedTerm } from '@/knowledge/types'
import { callLLM, checkTokenBudget } from '@/models/client'
import type { AssessmentResult } from './types'
import {
  buildVeterinarySearchQuery,
  formatWebSearchContext,
  webSearch,
} from '@/tools/web-search'
import type { WebSearchResult } from '@/tools/web-search'

// ============================================================
// 1. 行业强约束 System Prompt（统一角色+规则+输出范式）
// ============================================================

const SYSTEM_PROMPT = `你是专业宠物全科医师AI助手，仅限解答猫（ feline ）和犬（ canine ）疾病相关问题。

=== 角色与规则 ===
1. 你是信息分析者而非诊断者：基于用户的症状描述和知识库数据，拆解核心症状、发病动物类型，结合宠物医学常识列出高度关联的疑似疾病。
2. 区分典型症状与非典型症状，不做绝对确诊，所有输出末尾必须标注"以上内容为初步可能性参考，不能替代执业兽医当面诊断，建议就医"。
3. 症状描述模糊、信息过少时，主动引导用户补充：宠物品种、年龄、精神状态、食欲、排便情况。不要强行下判断。
4. 禁止编造不存在的疾病名称；禁止推荐偏方、民间疗法、未经验证的护理方式；禁止给出处方药具体剂量和用药疗程。
5. 仅处理猫和犬。若用户提及其他动物，回复"本助手仅面向猫、犬提供咨询服务"。
6. 对罕见症状（如蓝色皮肤、绿色尿液等），不要强行关联常见病，优先标注"症状罕见，建议线下就医专科检查"。

=== 输出范式 ===
【疑似疾病（按概率排序）】
1. XX疾病（可能性：较高/中等/需鉴别）
   ● 匹配依据：（用户症状如何符合该疾病特征）
   ● 不符之处：（该疾病典型但用户未提及的症状）
   ● 建议检查：（推荐去医院做的检查项目）
2. XX疾病（可能性：…）
   …
3. XX疾病（可能性：…）
   …

【追问引导】（仅当信息不足时输出）
- 为了更准确判断，请补充以下信息：XXX

【居家护理参考】
可做：
- XXX
禁止：
- XXX（需遵兽医嘱）

【就医建议】
- 若出现以下情况请立即就医：XXX

以上内容为初步可能性参考，不能替代执业兽医当面诊断，建议就医。`

// 兜底 Prompt: 无知识库匹配时额外强调
const FALLBACK_SYSTEM_PROMPT = SYSTEM_PROMPT + `

⚠️ 当前知识库未检索到精确匹配的疾病条目。请你运用兽医学专业知识，基于通用训练数据进行分析。
你必须列出具体的疑似疾病名称（如"过敏性皮炎""角膜溃疡""牙周病"等真实病名），不要用笼统的类别代替。
在【疑似疾病】最后增加一行："🌐 此分析基于通用大模型知识，未经专项兽医知识库交叉验证，仅供参考。"`

// ============================================================
// 主入口
// ============================================================

export async function diagnose(
  normalized: NormalizedInput,
  species: '犬' | '猫' | '兔' | '仓鼠',
  assessmentResult?: AssessmentResult,
  rawUserText?: string,
  verifiedTerms?: VerifiedTerm[],
  precomputedSearchResults?: SearchResult[]
): Promise<{
  rawDiagnoses: RawDiagnosis[]
  searchResults: SearchResult[]
  systemPrompt: string
  source: DiagnosisSource
  webSources: WebSearchResult[]
}> {
  // ── Step 0: 非犬猫拦截 ──
  if (species !== '犬' && species !== '猫') {
    return {
      rawDiagnoses: [],
      searchResults: [],
      systemPrompt: SYSTEM_PROMPT,
      source: 'knowledge_base',
      webSources: [],
    }
  }

  // ── Step 1: 从归一化结果提取关键词 ──
  const symptomNames = [
    ...normalized.chiefComplaint.map((s) => s.name),
    ...normalized.accompanyingSymptoms.map((s) => s.name),
  ]

  // ── Step 2: RAG 检索（优先使用验证过的关键词）──
  // v2.0: 如果上游已通过 normalization-verifier 验证，使用带权重的检索
  let searchResults: SearchResult[]
  if (verifiedTerms && verifiedTerms.length > 0) {
    searchResults = searchVerified(verifiedTerms, species)
  } else {
    searchResults = search(symptomNames, species)
  }

  if (precomputedSearchResults && precomputedSearchResults.length > 0) {
    searchResults = mergeSearchResults(precomputedSearchResults, searchResults)
  }

  // ── Step 3: 兜底检索 — 如果验证检索无结果，回退到传统检索 ──
  if (searchResults.length === 0 && verifiedTerms && verifiedTerms.length > 0) {
    searchResults = search(symptomNames, species)
  }

  const convergentDiagnoses = buildConvergentDiagnoses(
    assessmentResult?.convergentCandidates || [],
    searchResults
  )
  if (convergentDiagnoses.rawDiagnoses.length > 0) {
    return {
      rawDiagnoses: convergentDiagnoses.rawDiagnoses,
      searchResults: convergentDiagnoses.searchResults,
      systemPrompt: SYSTEM_PROMPT,
      source: 'knowledge_base',
      webSources: [],
    }
  }

  // ── Step 4: 构建增强版知识库上下文（RAG优化）──
  const hasKbMatch = searchResults.length > 0 && searchResults[0].score >= 0.25
  if (hasKbMatch) {
    return {
      rawDiagnoses: buildKnowledgeBaseDiagnoses(searchResults),
      searchResults,
      systemPrompt: SYSTEM_PROMPT,
      source: 'knowledge_base',
      webSources: [],
    }
  }

  // ── Step 5: 构建增强版知识库上下文（仅供兜底摘要，不参与KB诊断决策）──
  const knowledgeContext = buildEnhancedContext(searchResults, species)

  // ── Step 6: 构建用户消息 ──
  const userMessage = buildUserMessage(normalized, species, assessmentResult)

  // ── Step 7: 无KB命中才启用 LLM / 联网兜底 ──
  let finalPrompt = FALLBACK_SYSTEM_PROMPT
  let source: DiagnosisSource = 'llm_fallback'
  let webSources: WebSearchResult[] = []
  let webSearchContext = ''

  const webQuery = buildVeterinarySearchQuery(species, symptomNames, rawUserText)
  const webResult = await webSearch(webQuery)
  webSources = webResult.results
  webSearchContext = formatWebSearchContext(webSources)
  if (webSources.length > 0) {
    source = 'web_search'
    finalPrompt += `

=== 联网搜索约束 ===
你会收到联网搜索摘要。只能把它作为补充参考，不能把搜索结果包装成确诊。
输出中必须提示用户：联网结果需要由执业兽医结合体检和检查确认。`
  }

  // Token 预算检查
  const budget = checkTokenBudget(finalPrompt, knowledgeContext, userMessage)
  const contextToInject = budget.strategy === 'degraded'
    ? knowledgeContext.slice(0, 1500)
    : knowledgeContext

  // ── Step 7: 调用LLM ──
  const llmResult = await callLLM(
    finalPrompt,
    `${webSearchContext ? `=== 联网搜索参考信息 ===\n${webSearchContext}\n\n` : ''}=== 用户问诊信息 ===\n${userMessage}\n\n请基于通用兽医学知识分析上述症状，列出3种最可能的疑似疾病。`
  )

  // ── Step 8: 解析输出 ──
  const rawDiagnoses = parseDiagnosisOutput(
    llmResult.content || '',
    searchResults
  )

  return {
    rawDiagnoses,
    searchResults,
    systemPrompt: finalPrompt,
    source,
    webSources,
  }
}

// ============================================================
// 增强版 RAG 上下文构建
// ============================================================

function buildEnhancedContext(results: SearchResult[], species: '犬' | '猫' | '兔' | '仓鼠'): string {
  if (results.length === 0) {
    // 即使无匹配,也找出同物种的常见疾病做参考上下文
    const allSpeciesResults = search(['发热', '呕吐', '腹泻'], species)
    if (allSpeciesResults.length === 0) {
      return '（当前知识库中暂无该物种的参考数据）'
    }
    return '【以下是该物种知识库中的部分参考内容，供推理时参考】\n' +
      allSpeciesResults.slice(0, 5).map(formatEntry).join('\n')
  }

  // 精确匹配 + 部分匹配都注入
  const top = results.slice(0, 5)  // Top 5 精确匹配
  const partial = results.slice(5, 10)  // 次匹配

  let context = ''

  if (top.length > 0) {
    context += '【高度匹配的疾病条目】\n'
    context += top.map(formatEntry).join('\n') + '\n'
  }

  if (partial.length > 0) {
    context += '【部分相关条目（含相似症状，供参考）】\n'
    context += partial.map(formatEntry).join('\n') + '\n'
  }

  // 补充同类别疾病（即使症状不完全匹配）
  if (top.length > 0) {
    const categories = new Set(top.map(r => r.entry.category))
    const sameCat = results
      .filter(r => categories.has(r.entry.category) && !top.includes(r) && !partial.includes(r))
      .slice(0, 3)
    if (sameCat.length > 0) {
      context += '【同类别其他疾病（供鉴别参考）】\n'
      context += sameCat.map(r =>
        `- ${r.entry.disease}（${r.entry.category}）: ${r.entry.symptoms.primary.slice(0,3).join('、')}`
      ).join('\n') + '\n'
    }
  }

  return context
}

function formatEntry(r: SearchResult, i?: number): string {
  const num = i !== undefined ? `${i + 1}. ` : ''
  return `${num}${r.entry.disease}（相似度:${r.score}${r.matchDetails.isCrossSpecies ? '，跨物种' : ''}）\n` +
    `   分类: ${r.entry.category} | 紧急度: ${r.entry.urgency}\n` +
    `   主要症状: ${r.entry.symptoms.primary.join('、')}\n` +
    `   次要症状: ${r.entry.symptoms.secondary.join('、')}\n` +
    `   诊断依据: ${r.entry.diagnosis_basis.slice(0, 300)}\n` +
    `   就医阈值: ${r.entry.vet_threshold.slice(0, 200)}\n` +
    (r.entry.differential_diagnosis.length > 0
      ? `   鉴别: ${r.entry.differential_diagnosis.map(d => d.disease).join(' / ')}\n`
      : '')
}

// ============================================================
// 用户消息构建
// ============================================================

function buildUserMessage(
  normalized: NormalizedInput,
  species: '犬' | '猫' | '兔' | '仓鼠',
  assessment?: AssessmentResult
): string {
  const lines: string[] = []

  lines.push(`动物类型: ${species}`)

  const chief = normalized.chiefComplaint.map(s => s.original || s.name)
  if (chief.length > 0) {
    lines.push(`核心症状: ${chief.join('、')}`)
  } else {
    lines.push(`核心症状: ⚠️ 用户未描述具体症状，请引导补充（不要强行判断）`)
  }

  const accomp = normalized.accompanyingSymptoms.map(s => s.original || s.name)
  if (accomp.length > 0) lines.push(`伴随症状: ${accomp.join('、')}`)

  if (normalized.timeline.duration !== 'unknown' && normalized.timeline.duration !== 'conflict') {
    lines.push(`持续时间: ${normalized.timeline.duration}`)
  } else if (normalized.timeline.duration === 'conflict') {
    lines.push(`持续时间: 无法确定（描述中存在矛盾）`)
  }
  if (normalized.timeline.pattern !== 'unknown') {
    lines.push(`发作模式: ${normalized.timeline.pattern}`)
  }
  if (normalized.timeline.onset) {
    lines.push(`发病时间: ${normalized.timeline.onset}`)
  }
  if (normalized.vitalSigns.length > 0) {
    lines.push(`体征: ${normalized.vitalSigns.map(v => `${v.value}${v.unit}${v.isAbnormal ? '(异常)' : ''}`).join('、')}`)
  }
  if (normalized.environmentFactors.length > 0) {
    lines.push(`环境因素: ${normalized.environmentFactors.join('、')}`)
  }

  if (assessment?.uncollectableFields?.length) {
    lines.push(`未能采集的信息: ${assessment.uncollectableFields.join('、')}`)
  }

  // 症状过少提示
  if (chief.length === 0 && accomp.length === 0) {
    lines.push('⚠️ 用户症状描述过于模糊，请引导补充信息，不要强行判断疾病。')
  }

  return lines.join('\n')
}

// ============================================================
// 输出解析
// ============================================================

function parseDiagnosisOutput(
  llmOutput: string,
  searchResults: SearchResult[]
): RawDiagnosis[] {
  const diagnoses: RawDiagnosis[] = []

  // 无效病名模式: 不是真实疾病，而是提示词片段或追问语句
  const INVALID_DISEASE_PATTERNS = [
    /\*\*/, /核心症状/, /基本信息/, /精神状态/, /食欲/, /请/, /？/, /\?/,
    /补充/, /描述/, /具体/, /异常/, /就诊/, /就医/, /参考/,
    /检查项目/, /护理/, /建议/, /注意/, /居家/,
    /^（/, /^\(/, /【/, /】/,
  ]

  function isValidDiseaseName(name: string): boolean {
    if (name.length < 2 || name.length > 50) return false
    for (const p of INVALID_DISEASE_PATTERNS) {
      if (p.test(name)) return false
    }
    return true
  }

  const sections = llmOutput.split(/\n(?=\d+[.、]\s*)/)

  for (const section of sections) {
    // 尝试多种匹配格式
    let disease = ''
    let supportEvidence = ''
    let opposeEvidence = ''

    // 格式1: "1. XX疾病（可能性：较高）"
    const m1 = section.match(/^\d+[.、]\s*(?:\*\*)?(.+?)(?:\*\*)?\s*[（(]可能性[：:]\s*(.+?)[）)]/)
    if (m1) {
      disease = m1[1].trim()
    } else {
      // 格式2: "1. **XX疾病**"
      const m2 = section.match(/^\d+[.、]\s*(?:\*\*)?(.+?)(?:\*\*)?(?:\s*[（(]|$)/m)
      if (m2) disease = m2[1].trim()
    }

    if (!disease || !isValidDiseaseName(disease)) continue

    const sm = section.match(/(?:匹配依据|支持依据|●\s*匹配依据)[：:]\s*(.+)/)
    if (sm) supportEvidence = sm[1].trim()

    const om = section.match(/(?:不符之处|不支持依据|●\s*不符之处)[：:]\s*(.+)/)
    if (om) opposeEvidence = om[1].trim()

    const relatedResult = searchResults.find((r) =>
      disease.includes(r.entry.disease) || r.entry.disease.includes(disease)
    )

    diagnoses.push({
      disease,
      confidence_raw: 0,
      supportingEvidence: supportEvidence,
      opposingEvidence: opposeEvidence,
      differentialDiagnosis: relatedResult?.entry.differential_diagnosis.map((d) => d.disease) || [],
    })
  }

  // 回退: 用KB第一条(仅当完全没有解析到诊断且KB有结果时)
  if (diagnoses.length === 0 && searchResults.length > 0) {
    const top = searchResults[0]
    diagnoses.push({
      disease: top.entry.disease,
      confidence_raw: 0,
      supportingEvidence: top.entry.diagnosis_basis.slice(0, 200),
      opposingEvidence: '',
      differentialDiagnosis: top.entry.differential_diagnosis.map((d) => d.disease),
    })
  }

  return diagnoses.slice(0, 3)
}

function buildKnowledgeBaseDiagnoses(searchResults: SearchResult[]): RawDiagnosis[] {
  if (searchResults.length === 0) return []

  const limit = determineKnowledgeBaseDiagnosisLimit(searchResults)
  return searchResults.slice(0, limit).map((result) => ({
    disease: result.entry.disease,
    confidence_raw: 0,
    supportingEvidence: buildKnowledgeBaseSupportingEvidence(result),
    opposingEvidence: buildKnowledgeBaseOpposingEvidence(result),
    differentialDiagnosis: result.entry.differential_diagnosis.map((diagnosis) => diagnosis.disease),
  }))
}

function determineKnowledgeBaseDiagnosisLimit(searchResults: SearchResult[]): number {
  const top = searchResults[0]
  const second = searchResults[1]
  if (!second) return 1

  const lead = top.score - second.score
  if (top.score >= 0.75 && lead >= 0.15) return 1
  if (top.score >= 0.55 && lead >= 0.08) return 2
  return Math.min(3, searchResults.length)
}

function buildKnowledgeBaseSupportingEvidence(result: SearchResult): string {
  const primary = result.entry.symptoms.primary.slice(0, 4).join('、')
  const tests = (result.entry.required_tests || [])
    .filter((test) => test.priority === 'required')
    .map((test) => test.test)
    .slice(0, 3)
    .join('、')
  const parts = [
    `知识库条目：${result.entry.disease}`,
    `匹配度：${Math.round(result.score * 100)}%`,
    primary ? `核心症状：${primary}` : '',
    result.entry.diagnosis_basis ? `依据：${result.entry.diagnosis_basis.slice(0, 180)}` : '',
    tests ? `建议检查：${tests}` : '',
  ].filter(Boolean)
  return parts.join('；')
}

function buildKnowledgeBaseOpposingEvidence(result: SearchResult): string {
  const ruleOut = (result.entry.rule_out || [])
    .map((item) => item.evidence)
    .slice(0, 3)
  if (ruleOut.length > 0) return ruleOut.join('；')

  const missing = result.entry.symptoms.primary
    .filter((symptom) => !result.entry.entry_symptoms?.includes(symptom))
    .slice(0, 3)
  return missing.length > 0
    ? `仍需确认：${missing.join('、')}`
    : '仍需结合体检和必要检查确认'
}

function buildConvergentDiagnoses(
  convergentCandidates: Array<{ disease: string; score: number; reason: string }>,
  searchResults: SearchResult[]
): { rawDiagnoses: RawDiagnosis[]; searchResults: SearchResult[] } {
  if (convergentCandidates.length === 0 || searchResults.length === 0) {
    return { rawDiagnoses: [], searchResults }
  }

  const orderedResults: SearchResult[] = []
  for (const candidate of convergentCandidates) {
    const result = searchResults.find((r) =>
      candidate.disease.includes(r.entry.disease) ||
      r.entry.disease.includes(candidate.disease)
    )
    if (result && !orderedResults.includes(result)) {
      orderedResults.push(result)
    }
  }

  if (orderedResults.length === 0) {
    return { rawDiagnoses: [], searchResults }
  }

  const remaining = searchResults.filter((result) => !orderedResults.includes(result))
  const reorderedSearchResults = [...orderedResults, ...remaining]

  return {
    searchResults: reorderedSearchResults,
    rawDiagnoses: orderedResults.slice(0, Math.max(1, convergentCandidates.length)).map((result) => ({
      disease: result.entry.disease,
      confidence_raw: 0,
      supportingEvidence: result.entry.diagnosis_basis.slice(0, 220),
      opposingEvidence: '',
      differentialDiagnosis: result.entry.differential_diagnosis.map((d) => d.disease),
    })),
  }
}

function mergeSearchResults(
  priorityResults: SearchResult[],
  fallbackResults: SearchResult[]
): SearchResult[] {
  const byId = new Map<string, SearchResult>()
  for (const result of [...priorityResults, ...fallbackResults]) {
    const existing = byId.get(result.entry.id)
    if (!existing || result.score > existing.score) {
      byId.set(result.entry.id, result)
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
}
