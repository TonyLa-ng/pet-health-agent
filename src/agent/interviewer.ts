// ============================================
// M4: Adaptive Interview Engine (自适应追问引擎)
//
// 策略: 知识库比对 → 找候选疾病 → 提取鉴别症状 →
//       自适应追问 → 根据回答收敛 → 锁定输出
//
// 终止条件(不限轮次):
//   - 候选疾病收敛到1-2个 → 输出诊断
//   - 用户连续2次答非所问 → 中断,提示重新描述
//   - 候选疾病分值接近 → 同时输出,让用户自行判断
// ============================================

import type { SessionContext } from '@/store/types'
import type { SearchResult, KnowledgeEntry } from '@/knowledge/types'
import { getConsultationConfig, type ConsultationConfig } from './consultation-config'

/** 无效回答模式 */
const INVALID_ANSWER_PATTERNS = [
  /^(不知道|不清楚|不记得|忘了|我也不清楚|不太清楚|我也不太清楚)[。.！!]*$/,
  /^[?？]{1,3}$/,
  /^[.。！!]{1,3}$/,
  /^(嗯|哦|啊|呃|额)[。.！!]*$/,
]

/** 候选疾病追踪 */
interface CandidateTracker {
  entry: KnowledgeEntry
  baseScore: number       // 来自 RAG 的基础匹配分 (0-100)
  score: number           // 当前匹配分 (0-100)
  matchedSymptoms: string[]  // 已确认匹配的症状
  deniedSymptoms: string[]   // 用户否认的症状
  askedQuestions: Set<string> // 已经问过的鉴别问题
}

/** 鉴别问题 */
interface DifferentialQuestionMeta {
  field: string
  question: string
  guidance: string
  priority: number
  yesDiseaseIds: string[]    // 如果答案为"是"→支持哪些疾病
  noDiseaseIds: string[]     // 如果答案为"否"→支持哪些疾病
  symptom: string
}

type AnswerPolarity = 'yes' | 'no' | 'unknown'

interface DifferentialSessionContext extends SessionContext {
  _sessionId?: string
  pendingDifferentialQuestions?: DifferentialQuestionMeta[]
  answeredDifferentialQuestions?: string[]
}

// ============================================
// 主入口
// ============================================

/**
 * 基于知识库搜索结果的鉴别诊断追问
 *
 * @param context      会话上下文
 * @param searchResults M1检索返回的候选疾病
 * @param lastUserMessage 用户最新消息
 * @param invalidCount 累计答非所问次数
 * @param previousQuestions 之前已经问过的问题文本(用于去重)
 */
export function assessDifferential(
  context: SessionContext,
  searchResults: SearchResult[],
  lastUserMessage: string,
  invalidCount: number = 0,
  previousQuestions: string[] = []
): {
  isComplete: boolean
  questions: { field: string; question: string; guidance: string; priority: number }[]
  convergentCandidates: Array<{ disease: string; score: number; reason: string }>
  shouldRestart: boolean
  restartReason?: string
  newInvalidCount: number
} {
  const config = getConsultationConfig()
  const differentialContext = context as DifferentialSessionContext

  // 1. 无搜索结果 → 无法追问
  if (searchResults.length === 0) {
    return {
      isComplete: true, convergentCandidates: [], questions: [],
      shouldRestart: false, newInvalidCount: invalidCount,
    }
  }

  // 2. 检查答非所问
  const isInvalid = INVALID_ANSWER_PATTERNS.some(p => p.test(lastUserMessage.trim()))
  const newInvalidCount = isInvalid ? invalidCount + 1 : 0

  if (newInvalidCount >= 2) {
    return {
      isComplete: false, questions: [], convergentCandidates: [],
      shouldRestart: true,
      restartReason: '连续两次无法获取有效信息。请重新描述宠物的具体症状（如：呕吐、腹泻、咳嗽等），以便我为你做准确分析。',
      newInvalidCount,
    }
  }

  // 3. 初始化/更新候选疾病追踪
  const candidates = initOrUpdateCandidates(
    context, searchResults, lastUserMessage, isInvalid
  )

  // 4. 检查是否已收敛
  const topCandidates = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  // 先准备可用鉴别问题。相似候选如果仍有可问差异点，应继续追问而不是直接输出多个结果。
  const questionMetas = generateDifferentialQuestions(
    topCandidates, previousQuestions, lastUserMessage
  )

  // 收敛判定:
  //   - 单候选: 分数≥75 才收敛,否则继续追问补充信息
  //   - 多候选: 第一名≥70 且领先第二名≥20 才收敛
  //   - 接近: 如果没有可用鉴别问题才同时输出
  const singleWinner = topCandidates.length === 1 && topCandidates[0].score >= config.interview.singleWinnerScore
  const clearWinner = topCandidates.length >= 2 &&
    topCandidates[0].score >= config.interview.clearWinnerScore &&
    topCandidates[0].score - topCandidates[1].score >= config.convergence.clearLeadGap
  const answeredDifferentialCount = differentialContext.answeredDifferentialQuestions?.length || 0
  const answeredDifferentialWinner = topCandidates.length >= 2 &&
    answeredDifferentialCount > 0 &&
    topCandidates[0].score >= config.interview.answeredWinnerScore &&
    topCandidates[0].score - topCandidates[1].score >= config.interview.partialLeadGap
  const strongEvidenceWinner = topCandidates.length >= 2 &&
    topCandidates[0].score >= config.interview.strongEvidenceWinnerScore &&
    topCandidates[0].score - topCandidates[1].score >= config.interview.partialLeadGap &&
    topCandidates[0].matchedSymptoms.some(isStrongDifferentialSymptom)
  const tooClose = topCandidates.length >= 2 &&
    topCandidates[0].score >= config.interview.closeCandidateScore &&
    topCandidates[1].score >= config.interview.closeCandidateScore &&
    topCandidates[0].score - topCandidates[1].score <= config.interview.closeCandidateGap
  const canAskDifferential = questionMetas.length > 0

  if (singleWinner || clearWinner || answeredDifferentialWinner || strongEvidenceWinner || (tooClose && !canAskDifferential)) {
    return {
      isComplete: true,
      questions: [],
      convergentCandidates: topCandidates.slice(0, tooClose ? 2 : 1).map(c => ({
        disease: c.entry.disease,
        score: c.score,
        reason: c.matchedSymptoms.length > 0
          ? `匹配症状: ${c.matchedSymptoms.join('、')}`
          : '基于知识库综合评估',
      })),
      shouldRestart: false,
      newInvalidCount,
    }
  }

  // 5. 生成鉴别追问问题
  const questions = questionMetas.map(({ field, question, guidance, priority }) => ({
    field, question, guidance, priority,
  }))
  differentialContext.pendingDifferentialQuestions = questionMetas

  // 6. 无鉴别问题可问 → 生成通用补充追问(询问更多症状细节)
  if (questions.length === 0) {
    differentialContext.pendingDifferentialQuestions = []
    const topDisease = topCandidates[0]
    const genericQuestions = generateGenericFollowup(topDisease, topCandidates)
    if (genericQuestions.length > 0) {
      return {
        isComplete: false,
        questions: genericQuestions.slice(0, config.interview.maxQuestionsPerRound),
        convergentCandidates: [],
        shouldRestart: false,
        newInvalidCount,
      }
    }
    // 实在无问题可问 → 输出当前最佳
    return {
      isComplete: true,
      questions: [],
      convergentCandidates: topCandidates.slice(0, 2).map(c => ({
        disease: c.entry.disease,
        score: c.score,
        reason: '已收集所有可用的鉴别信息',
      })),
      shouldRestart: false,
      newInvalidCount,
    }
  }

  return {
    isComplete: false,
    questions: questions.slice(0, config.interview.maxQuestionsPerRound),
    convergentCandidates: [],
    shouldRestart: false,
    newInvalidCount,
  }
}

// ============================================
// 候选疾病追踪
// ============================================

/** 会话级候选缓存 */
const candidateCache = new Map<string, CandidateTracker[]>()

function initOrUpdateCandidates(
  context: SessionContext,
  searchResults: SearchResult[],
  userMessage: string,
  isInvalid: boolean
): CandidateTracker[] {
  const config = getConsultationConfig()
  // 使用 session 标识隔离缓存
  const differentialContext = context as DifferentialSessionContext
  const sessionKey = differentialContext._sessionId || 'default'

  // 首次或重置
  if (!candidateCache.has(sessionKey) || candidateCache.get(sessionKey)!.length === 0) {
    const trackers = searchResults.slice(0, config.interview.trackedCandidateLimit).map(r => ({
      entry: r.entry,
      baseScore: Math.round(r.score * 100),
      score: Math.round(r.score * 100),
      matchedSymptoms: [] as string[],
      deniedSymptoms: [] as string[],
      askedQuestions: new Set<string>(),
    }))
    candidateCache.set(sessionKey, trackers)

    // 首次: 从用户消息中提取已匹配的症状
    if (!isInvalid) {
      applyPendingQuestionAnswers(context, trackers, userMessage)
      updateEvidenceFromMessage(trackers, userMessage)
      recomputeScores(trackers, config)
    }
    return trackers
  }

  // 更新已有追踪，并合并新一轮 RAG 结果，避免首轮候选偏差导致后续无法纠正。
  const trackers = candidateCache.get(sessionKey)!
  mergeSearchResultsIntoTrackers(trackers, searchResults)
  if (!isInvalid) {
    applyPendingQuestionAnswers(context, trackers, userMessage)
    updateEvidenceFromMessage(trackers, userMessage)
    recomputeScores(trackers, config)
  }
  return trackers
}

function mergeSearchResultsIntoTrackers(
  trackers: CandidateTracker[],
  searchResults: SearchResult[]
): void {
  const config = getConsultationConfig()
  const byId = new Map(trackers.map(t => [t.entry.id, t]))

  for (const result of searchResults.slice(0, config.interview.trackedCandidateLimit)) {
    const baseScore = Math.round(result.score * 100)
    const existing = byId.get(result.entry.id)
    if (existing) {
      existing.entry = result.entry
      existing.baseScore = Math.max(existing.baseScore, baseScore)
    } else {
      const tracker: CandidateTracker = {
        entry: result.entry,
        baseScore,
        score: baseScore,
        matchedSymptoms: [],
        deniedSymptoms: [],
        askedQuestions: new Set<string>(),
      }
      trackers.push(tracker)
      byId.set(result.entry.id, tracker)
    }
  }
}

/** 从用户消息更新候选证据 */
function updateEvidenceFromMessage(
  trackers: CandidateTracker[],
  message: string
): void {
  const msg = message.toLowerCase()

  for (const t of trackers) {
    // 检查主要症状
    for (const symptom of t.entry.symptoms.primary) {
      if (messageMentionsSymptom(msg, symptom) && !t.matchedSymptoms.includes(symptom)) {
        t.matchedSymptoms.push(symptom)
      }
    }
    // 检查次要症状
    for (const symptom of t.entry.symptoms.secondary) {
      if (messageMentionsSymptom(msg, symptom) && !t.matchedSymptoms.includes(symptom)) {
        t.matchedSymptoms.push(symptom)
      }
    }
    // 检查否定表述: "不/没/无 + 症状"
    for (const symptom of [...t.entry.symptoms.primary, ...t.entry.symptoms.secondary]) {
      const negPattern = new RegExp(`(不|没|无|没有|未)[^，。,.；;]{0,4}${escapeRegExp(symptom)}`)
      if (negPattern.test(msg) && !t.deniedSymptoms.includes(symptom)) {
        t.deniedSymptoms.push(symptom)
      }
    }
  }
}

function applyPendingQuestionAnswers(
  context: SessionContext,
  trackers: CandidateTracker[],
  message: string
): void {
  const differentialContext = context as DifferentialSessionContext
  const pending = differentialContext.pendingDifferentialQuestions || []
  if (pending.length === 0) return

  const answeredKeys = new Set<string>(differentialContext.answeredDifferentialQuestions || [])

  for (const question of pending) {
    if (answeredKeys.has(question.question)) continue
    const polarity = classifyAnswerForQuestion(message, question)
    if (polarity === 'unknown') continue

    const supportIds = polarity === 'yes' ? question.yesDiseaseIds : question.noDiseaseIds
    const opposeIds = polarity === 'yes' ? question.noDiseaseIds : question.yesDiseaseIds

    for (const tracker of trackers) {
      if (supportIds.includes(tracker.entry.id)) {
        addUnique(tracker.matchedSymptoms, question.symptom)
      }
      if (opposeIds.includes(tracker.entry.id)) {
        addUnique(tracker.deniedSymptoms, question.symptom)
      }
    }

    answeredKeys.add(question.question)
  }

  differentialContext.answeredDifferentialQuestions = Array.from(answeredKeys)
  differentialContext.pendingDifferentialQuestions = []
}

function classifyAnswerForQuestion(message: string, question: DifferentialQuestionMeta): AnswerPolarity {
  const msg = message.toLowerCase().trim()
  if (!msg) return 'unknown'

  const symptom = question.symptom.toLowerCase()
  if (symptom && messageMentionsQuestionConcept(msg, question)) {
    const negNearSymptom = new RegExp(`(不|没|无|没有|未)[^，。,.；;]{0,6}${escapeRegExp(symptom)}`)
    if (negNearSymptom.test(msg)) return 'no'
    return 'yes'
  }

  // 长回答通常只回答了部分问题。若没有提到该问题的概念，不把开头的“有/没有”套给所有问题。
  if (msg.length > 8) return 'unknown'

  if (/(完全|一直|根本)?(尿不出|排不出|不能排|没尿|无尿|没有尿|不排尿)/.test(msg)) return 'no'
  if (/(没有|没|无|未|不是|不能|不可以|没吃|没有吃|没出现|没有出现)/.test(msg)) return 'no'
  if (/(有|是|会|能|可以|出现|明显|还有|一点|几滴|少量|吃了|吃过|排得出|能排出)/.test(msg)) return 'yes'

  return 'unknown'
}

function messageMentionsQuestionConcept(
  message: string,
  question: DifferentialQuestionMeta
): boolean {
  const symptom = question.symptom.toLowerCase()
  if (symptom && message.includes(symptom)) return true

  const text = `${question.question} ${question.symptom}`
  if (/剧烈腹痛|腹痛/.test(text)) return /剧烈腹痛|腹痛|肚子疼|肚子痛|疼得厉害|痛得厉害|很疼|很痛/.test(message)
  if (/食欲废绝/.test(text)) return /食欲废绝|完全不吃|一点不吃|绝食|不吃不喝/.test(message)
  if (/剧烈呕吐/.test(text)) return /剧烈呕吐|吐得厉害|一直吐|频繁吐|不停吐/.test(message)
  if (/高脂肪|肥肉|油炸|油腻/.test(text)) return /高脂肪|肥肉|油炸|油腻|吃油|吃了肉/.test(message)
  if (/弓背|祈祷/.test(text)) return /弓背|祈祷|趴着|撅屁股/.test(message)
  if (/排便|大便|便血|血便/.test(text)) return /排便|大便|便便|拉屎|血便|便血|拉血/.test(message)
  if (/尿液|排尿量|无尿|尿不出|少尿/.test(text)) return /尿|猫砂|排尿|尿不出|无尿|少尿|几滴/.test(message)
  if (/疫苗|免疫/.test(text)) return /疫苗|免疫|打针/.test(message)
  if (/垃圾桶|玩具|异物|啃咬/.test(text)) return /垃圾桶|玩具|异物|啃|吞|吃了/.test(message)
  if (/百合|防冻液|毒/.test(text)) return /百合|防冻液|毒|药|葡萄|洋葱/.test(message)

  return false
}

function messageMentionsSymptom(message: string, symptom: string): boolean {
  if (message.includes(symptom)) return true
  if (/弓背姿势/.test(symptom)) return /弓背|祈祷/.test(message)
  if (/剧烈腹痛/.test(symptom)) return /剧烈腹痛|肚子疼得厉害|肚子痛得厉害|很疼|很痛/.test(message)
  if (/食欲废绝/.test(symptom)) return /完全不吃|一点不吃|绝食|不吃不喝/.test(message)
  if (/剧烈呕吐/.test(symptom)) return /吐得厉害|一直吐|频繁吐|不停吐/.test(message)
  if (/完全无尿|仅滴尿|频繁进猫砂盆但无尿/.test(symptom)) return /尿不出|没有尿|无尿|几滴|猫砂盆/.test(message)
  return false
}

function isStrongDifferentialSymptom(symptom: string): boolean {
  return /弓背|祈祷|无尿|少尿|尿不出|血便|黑便|黄疸|呼吸困难|休克|虚脱|牙龈苍白|食欲废绝|剧烈腹痛|剧烈呕吐/.test(symptom)
}

function recomputeScores(trackers: CandidateTracker[], config: ConsultationConfig): void {
  for (const tracker of trackers) {
    let score = tracker.baseScore

    for (const symptom of tracker.matchedSymptoms) {
      if (tracker.entry.symptoms.primary.includes(symptom)) {
        score += config.interview.primarySymptomConfirmBoost
      } else if (tracker.entry.symptoms.secondary.includes(symptom)) {
        score += isStrongDifferentialSymptom(symptom)
          ? config.interview.strongSecondaryConfirmBoost
          : config.interview.secondaryConfirmBoost
      } else {
        score += config.interview.differentialConfirmBoost
      }
    }

    for (const symptom of tracker.deniedSymptoms) {
      if (tracker.entry.symptoms.primary.includes(symptom)) {
        score -= config.interview.primaryDeniedPenalty
      } else if (tracker.entry.symptoms.secondary.includes(symptom)) {
        score -= config.interview.secondaryDeniedPenalty
      } else {
        score -= config.interview.differentialDeniedPenalty
      }
    }

    tracker.score = Math.max(0, Math.min(100, score))
  }
}

function addUnique(values: string[], value: string): void {
  if (value && !values.includes(value)) values.push(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ============================================
// 鉴别问题生成
// ============================================

function generateDifferentialQuestions(
  candidates: CandidateTracker[],
  previousQuestions: string[],
  lastUserMessage: string
): DifferentialQuestionMeta[] {
  const config = getConsultationConfig()
  if (candidates.length < 2) return []

  const questions: DifferentialQuestionMeta[] = []
  const askedSet = new Set(previousQuestions)
  const relevantCandidates = filterRelevantCandidates(candidates, lastUserMessage)

  // 优先从候选之间的症状差异生成可结构化吸收的问题。
  questions.push(...generateSymptomDifferenceQuestions(relevantCandidates, askedSet))

  // 从知识条目的 differential_diagnosis.key_questions 中提取
  for (const candidate of relevantCandidates) {
    for (const diff of candidate.entry.differential_diagnosis) {
      const diffCandidate = findCandidateByDisease(relevantCandidates, diff.disease)
      for (const q of diff.key_questions) {
        if (askedSet.has(q) || candidate.askedQuestions.has(q)) continue
        const meta = buildQuestionMetaFromKbQuestion(candidate, diffCandidate, diff.disease, q)
        questions.push({
          ...meta,
          field: `diff_${candidate.entry.id}`,
          question: q,
          guidance: `帮助区分「${candidate.entry.disease}」与「${diff.disease}」`,
          priority: meta.priority,
        })
        candidate.askedQuestions.add(q)
        askedSet.add(q)
      }
    }
  }

  // 去重+排序: 优先问能区分前两名的问题
  const unique = questions.filter((q, i, arr) =>
    arr.findIndex(x => x.question === q.question) === i
  )

  unique.sort((a, b) => a.priority - b.priority)

  return unique.slice(0, config.interview.maxQuestionsPerRound)
}

function filterRelevantCandidates(
  candidates: CandidateTracker[],
  lastUserMessage: string
): CandidateTracker[] {
  const config = getConsultationConfig()
  if (candidates.length <= 1) return candidates

  const dominantCategory = candidates[0].entry.category
  const filtered = candidates.filter((candidate, index) => {
    if (index === 0) return true
    if (candidate.entry.category === dominantCategory) return true
    if (candidate.score >= config.interview.relevantCandidateScore) return true
    return hasCandidateEvidenceInMessage(candidate, lastUserMessage)
  })

  return filtered.length >= 2 ? filtered : candidates.slice(0, 2)
}

function hasCandidateEvidenceInMessage(
  candidate: CandidateTracker,
  message: string
): boolean {
  const terms = [
    candidate.entry.category,
    candidate.entry.disease,
    ...candidate.entry.symptoms.primary,
    ...candidate.entry.symptoms.secondary,
  ]

  return terms.some((term) => {
    const normalized = term.replace(/[（(].*?[）)]/g, '').trim()
    return normalized.length >= 2 && message.includes(normalized)
  })
}

/** 从症状差异生成问题 */
function generateSymptomDifferenceQuestions(
  candidates: CandidateTracker[],
  askedSet: Set<string>
): DifferentialQuestionMeta[] {
  const questions: DifferentialQuestionMeta[] = []

  if (candidates.length < 2) return questions

  const top2 = [candidates[0], candidates[1]]
  const [first, second] = top2

  collectUniqueSymptomQuestions(first, second, askedSet, questions)
  collectUniqueSymptomQuestions(second, first, askedSet, questions)

  questions.sort((a, b) => a.priority - b.priority)

  return questions
}

function collectUniqueSymptomQuestions(
  target: CandidateTracker,
  alternative: CandidateTracker,
  askedSet: Set<string>,
  questions: DifferentialQuestionMeta[]
): void {
  const alternativeSymptoms = new Set([
    ...alternative.entry.symptoms.primary,
    ...alternative.entry.symptoms.secondary,
  ])
  const targetSymptoms = [
    ...target.entry.symptoms.primary.map(symptom => ({ symptom, primary: true })),
    ...target.entry.symptoms.secondary.map(symptom => ({ symptom, primary: false })),
  ]

  for (const { symptom, primary } of targetSymptoms) {
    if (alternativeSymptoms.has(symptom)) continue
    if (target.matchedSymptoms.includes(symptom) || target.deniedSymptoms.includes(symptom)) continue

    const q = `宠物有没有出现「${symptom}」的症状？`
    if (askedSet.has(q)) continue

    questions.push({
      field: `symptom_${target.entry.id}_${symptom}`,
      question: q,
      guidance: `用于区分「${target.entry.disease}」与「${alternative.entry.disease}」`,
      priority: getSymptomQuestionPriority(symptom, target.entry, primary),
      yesDiseaseIds: [target.entry.id],
      noDiseaseIds: [alternative.entry.id],
      symptom,
    })
    askedSet.add(q)
  }
}

function getSymptomQuestionPriority(
  symptom: string,
  entry: KnowledgeEntry,
  primary: boolean
): number {
  let priority = primary ? 2 : 3
  if (entry.urgency === 'critical' || entry.urgency === 'high') priority -= 1
  if (/无尿|尿不出|少尿|呼吸困难|休克|虚脱|血|剧烈|腹部胀大|弓背|食欲废绝|中毒/.test(symptom)) {
    priority -= 1
  }
  return Math.max(1, priority)
}

function findCandidateByDisease(
  candidates: CandidateTracker[],
  disease: string
): CandidateTracker | undefined {
  return candidates.find((candidate) =>
    candidate.entry.disease === disease ||
    candidate.entry.disease.includes(disease) ||
    disease.includes(candidate.entry.disease)
  )
}

function buildQuestionMetaFromKbQuestion(
  candidate: CandidateTracker,
  diffCandidate: CandidateTracker | undefined,
  diffDisease: string,
  question: string
): DifferentialQuestionMeta {
  const candidateSymptom = findMentionedSymptom(question, candidate.entry)
  const diffSymptom = diffCandidate ? findMentionedSymptom(question, diffCandidate.entry) : ''

  if (candidateSymptom && (!diffSymptom || candidateSymptom.length >= diffSymptom.length)) {
    return {
      field: `diff_${candidate.entry.id}_${candidateSymptom}`,
      question,
      guidance: `帮助区分「${candidate.entry.disease}」与「${diffDisease}」`,
      priority: getSymptomQuestionPriority(candidateSymptom, candidate.entry, true),
      yesDiseaseIds: [candidate.entry.id],
      noDiseaseIds: diffCandidate ? [diffCandidate.entry.id] : [],
      symptom: candidateSymptom,
    }
  }

  if (diffCandidate && diffSymptom) {
    return {
      field: `diff_${diffCandidate.entry.id}_${diffSymptom}`,
      question,
      guidance: `帮助区分「${candidate.entry.disease}」与「${diffDisease}」`,
      priority: getSymptomQuestionPriority(diffSymptom, diffCandidate.entry, true),
      yesDiseaseIds: [diffCandidate.entry.id],
      noDiseaseIds: [candidate.entry.id],
      symptom: diffSymptom,
    }
  }

  const inferredSymptom = inferSymptomFromQuestion(question)
  const yesDiseaseIds = diffCandidate ? [diffCandidate.entry.id] : [candidate.entry.id]
  const noDiseaseIds = diffCandidate ? [candidate.entry.id] : []

  return {
    field: `diff_${candidate.entry.id}_${inferredSymptom}`,
    question,
    guidance: `帮助区分「${candidate.entry.disease}」与「${diffDisease}」`,
    priority: /无尿|尿液|高脂肪|弓背|血|疫苗|异物|毒/.test(question) ? 1 : 2,
    yesDiseaseIds,
    noDiseaseIds,
    symptom: inferredSymptom,
  }
}

function findMentionedSymptom(question: string, entry: KnowledgeEntry): string {
  const symptoms = [...entry.symptoms.primary, ...entry.symptoms.secondary]
    .sort((a, b) => b.length - a.length)
  return symptoms.find(symptom => question.includes(symptom)) || ''
}

function inferSymptomFromQuestion(question: string): string {
  if (/高脂肪|肥肉|油炸/.test(question)) return '高脂肪饮食'
  if (/弓背|祈祷/.test(question)) return '弓背姿势'
  if (/尿液|排尿量|还能排出|少量尿|无尿|尿不出/.test(question)) return '排尿量异常'
  if (/疫苗|免疫/.test(question)) return '疫苗未完成'
  if (/垃圾桶|玩具|异物|啃咬/.test(question)) return '误食异物风险'
  if (/血便|带血|腥臭/.test(question)) return '血便'
  if (/百合|防冻液|毒/.test(question)) return '毒物接触'
  return question.replace(/[？?。]/g, '').slice(0, 16)
}

// ============================================
// 兼容旧接口 (供过渡使用)
// ============================================

/** 清除候选缓存(新会话时调用) */
export function resetCandidateCache(): void {
  candidateCache.clear()
}

/** 无鉴别问题时,基于最匹配疾病生成通用追问 */
function generateGenericFollowup(
  topCandidate: CandidateTracker,
  allCandidates: CandidateTracker[]
): { field: string; question: string; guidance: string; priority: number }[] {
  const questions: { field: string; question: string; guidance: string; priority: number }[] = []

  // 问未被否认且未被确认的次要症状
  const allSecondaries = new Set<string>()
  for (const c of allCandidates) {
    for (const s of c.entry.symptoms.secondary) {
      allSecondaries.add(s)
    }
  }

  const entry = topCandidate.entry
  // 优先问主要候选疾病的次要症状
  for (const s of entry.symptoms.secondary) {
    if (!topCandidate.matchedSymptoms.includes(s) && !topCandidate.deniedSymptoms.includes(s)) {
      questions.push({
        field: `secondary_${s}`,
        question: `宠物有没有出现「${s}」的情况？`,
        guidance: `这有助于确认是否为「${entry.disease}」`,
        priority: 3,
      })
    }
  }

  // 问持续时间和频率(如果还没有)
  if (topCandidate.matchedSymptoms.length <= 2) {
    questions.push({
      field: 'more_detail',
      question: '能否补充更多症状细节？比如症状从什么时候开始、发作频率、有无特定诱因？',
      guidance: '更详细的信息有助于缩小诊断范围',
      priority: 4,
    })
  }

  return questions
}

export function isInvalidAnswer(text: string): boolean {
  return INVALID_ANSWER_PATTERNS.some(p => p.test(text.trim()))
}
