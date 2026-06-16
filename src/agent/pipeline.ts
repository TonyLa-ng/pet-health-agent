// ============================================
// Consultation Pipeline (问诊管道)
// 串联 M2(MX)→M3→M4→M5→M6→M7 完整链路
// ============================================

import type { Session, SessionContext } from '@/store/types'
import { SessionState } from './types'
import type { SSEEvent } from '@/models/types'
import type { PipelineOutput } from '@/models/types'

import { detectTriage } from './triage'
import { normalize } from '@/knowledge/normalizer'
import { guardInput } from '@/compliance/input-guard'
import { assessDifferential, resetCandidateCache } from './interviewer'
import { diagnose } from './diagnostician'
import { search, searchVerified } from '@/knowledge/retriever'
import { loadAllKnowledge } from '@/knowledge/loader'
import { transformKeywords, mergeKeywords } from '@/knowledge/keyword-transformer'
import { verifyKeywords } from '@/knowledge/normalization-verifier'
import type { SearchResult, VerificationResult } from '@/knowledge/types'
import { logger } from '@/monitoring/logger'

import { calculate, calcInfoCompleteness } from './confidence'
import type { SymptomMatchInput } from './confidence'
import { generateReport } from './reporter'
import { buildCandidatePool } from './differential-router'
import { findNearbyVetHospitals } from '@/tools/vet-map'
import { filterNegatedTerms, isNegatedTerm } from './negation'
import { getProfile } from '@/store/profile'
import { transition, saveSession } from '@/store/session'
import { detectSpeciesMismatch } from '@/species'
import {
  createInitialConsultationState,
  mergeConsultationEvidence,
  type RankedDiseaseCandidate,
  updateConsultationRouting,
} from './consultation-state'
import { getConsultationConfig } from './consultation-config'

interface PipelineSessionContext extends SessionContext {
  _sessionId?: string
  previousQuestions?: string[]
  invalidAnswerCount?: number
  collectedRawText?: string[]
}

/** 从用户输入推断已采集的必采字段 */
function inferCompletedFields(
  text: string,
  existing: string[]
): string[] {
  const updated = new Set(existing)

  // 主诉症状：几乎每次输入都有 → 首次即标记
  updated.add('chiefComplaint')

  // 时长：包含时间描述关键词
  if (/小时|天|周|月|刚|刚才|昨天|今天|早上|晚上|持续|一直|好.*[天了]|一阵/.test(text)) {
    updated.add('duration')
  }

  // 频率：包含频率描述
  if (/次|回|遍|频繁|偶尔|一直|反复|间隔|每.*[次天]/.test(text)) {
    updated.add('frequency')
  }

  // 饮食：包含饮食相关词
  if (/吃|喝|食欲|食量|狗粮|猫粮|粮|罐头|水|喂|不吃|绝食/.test(text)) {
    updated.add('dietChange')
  }

  // 排便排尿：包含排泄相关词
  if (/尿|拉|便|屎|猫砂|排便|排尿|颜色|性状|软便|稀/.test(text)) {
    updated.add('stoolUrine')
  }

  // 精神：包含精神状态描述
  if (/精神|蔫|活跃|睡觉|睡|不动|躺着|趴着|躲|没劲/.test(text)) {
    updated.add('mentalStatus')
  }

  // 体温：包含体温数值
  if (/度|℃|体温|发烧|发热|烫/.test(text)) {
    updated.add('temperature')
  }

  // 用药：包含用药就医描述
  if (/药|医院|医生|诊所|看.*病|治/.test(text)) {
    updated.add('medication')
  }

  // 环境：包含环境变化描述
  if (/搬家|换.*粮|新.*宠|出门|外出|遛|美容|寄养/.test(text)) {
    updated.add('environment')
  }

  return Array.from(updated)
}

function mergeNormalizedInput(
  previous: SessionContext['normalizedInput'] | undefined,
  current: NonNullable<SessionContext['normalizedInput']>
): NonNullable<SessionContext['normalizedInput']> {
  if (!previous) return current

  const symptomKey = (symptom: { name: string }) => symptom.name
  const chiefByName = new Map<string, typeof current.chiefComplaint[number]>()
  const accompanyingByName = new Map<string, typeof current.accompanyingSymptoms[number]>()

  for (const symptom of previous.chiefComplaint) chiefByName.set(symptomKey(symptom), symptom)
  for (const symptom of current.chiefComplaint) chiefByName.set(symptomKey(symptom), symptom)

  for (const symptom of previous.accompanyingSymptoms) {
    if (!chiefByName.has(symptom.name)) accompanyingByName.set(symptomKey(symptom), symptom)
  }
  for (const symptom of current.accompanyingSymptoms) {
    if (!chiefByName.has(symptom.name)) accompanyingByName.set(symptomKey(symptom), symptom)
  }

  return {
    chiefComplaint: Array.from(chiefByName.values()),
    accompanyingSymptoms: Array.from(accompanyingByName.values()),
    vitalSigns: [...previous.vitalSigns, ...current.vitalSigns],
    timeline: {
      onset: current.timeline.onset || previous.timeline.onset,
      duration: current.timeline.duration !== 'unknown' ? current.timeline.duration : previous.timeline.duration,
      frequency: current.timeline.frequency || previous.timeline.frequency,
      pattern: current.timeline.pattern !== 'unknown' ? current.timeline.pattern : previous.timeline.pattern,
    },
    environmentFactors: [...new Set([...previous.environmentFactors, ...current.environmentFactors])],
    excludedNoise: [...new Set([...previous.excludedNoise, ...current.excludedNoise])],
  }
}

function removeNegatedSymptoms<T extends NonNullable<SessionContext['normalizedInput']>>(
  normalized: T,
  latestText: string
): T {
  return {
    ...normalized,
    chiefComplaint: normalized.chiefComplaint.filter((symptom) =>
      !isNegatedTerm(latestText, symptom.name) && !isNegatedTerm(latestText, symptom.original || symptom.name)
    ),
    accompanyingSymptoms: normalized.accompanyingSymptoms.filter((symptom) =>
      !isNegatedTerm(latestText, symptom.name) && !isNegatedTerm(latestText, symptom.original || symptom.name)
    ),
  }
}

/**
 * 执行问诊管道的一步
 *
 * @param session - 当前会话
 * @param userText - 用户输入文本
 * @returns PipelineOutput + 更新后的 session
 */
export async function runPipeline(
  session: Session,
  userText: string
): Promise<{ output: PipelineOutput; session: Session }> {
  const events: SSEEvent[] = []
  const now = Date.now()

  // Step 0: 前置校验 — 必填字段
  const pet = getProfile(session.petId)
  if (!pet) {
    throw new Error('宠物档案不存在，请先创建档案')
  }

  // Step 1: MX 输入合规检查
  const complianceResult = guardInput(userText, session.id)
  session.violationCount = complianceResult.violationCount

  if (complianceResult.blocked) {
    events.push({
      section: 'error',
      data: { message: '输入内容包含违规信息，请修改后重试', violations: complianceResult.violations },
      timestamp: now,
      isComplete: true,
    })
    saveSession(session)
    return {
      output: { triage: undefined as never, interview: undefined, report: undefined, sseEvents: events },
      session,
    }
  }

  // 使用脱敏后的文本
  const cleanText = complianceResult.maskedText
  const speciesMismatch = pet.species === '犬' || pet.species === '猫'
    ? detectSpeciesMismatch(cleanText, pet.species)
    : null
  if (speciesMismatch) {
    const triage = {
      isEmergency: false,
      level: 'normal' as const,
      score: 0,
      alerts: [],
      matchedSignals: [],
      durationExtracted: 'unknown' as const,
      durationConflict: false,
      durationEffect: 'neutral' as const,
      isRevisit: false,
      lowRiskReminder: false,
    }
    const mismatchInterview = {
      isComplete: false,
      missingFields: ['species'],
      questions: [{
        field: 'species_switch',
        question: speciesMismatch.message,
        guidance: '先确认犬猫问诊入口，避免把猫病按犬病链路、或把犬病按猫病链路分析',
        priority: 1,
      }],
      roundsUsed: 0,
      skippedFields: [],
      uncollectableFields: [],
      mandatoryFieldsCompleted: session.context.mandatoryFieldsCompleted || [],
      mandatoryFieldsMissing: ['species'],
    }

    session.context.interviewResult = mismatchInterview
    events.push({ section: 'triage', data: triage, timestamp: now, isComplete: true })
    events.push({ section: 'interview', data: mismatchInterview, timestamp: now, isComplete: true })
    if (session.state === SessionState.COLLECTING) {
      transition(session, SessionState.FOLLOWUP_R1)
    } else {
      saveSession(session)
    }
    return { output: { triage, interview: mismatchInterview, sseEvents: events }, session }
  }

  const pipelineContext = session.context as PipelineSessionContext
  const collectedRawText = [...(pipelineContext.collectedRawText || []), cleanText].slice(-8)
  pipelineContext.collectedRawText = collectedRawText
  const cumulativeText = collectedRawText.join('\n')
  session.context.mandatoryFieldsCompleted = inferCompletedFields(
    cleanText,
    session.context.mandatoryFieldsCompleted || []
  )

  // ================================================================
  // RAG 优化: Phase 1 — LLM 关键词转换
  // 将用户口语转化为标准化兽医关键词 + 同义词扩展 + 疾病方向
  // ================================================================
  const llmTransformResult = await transformKeywords(cleanText, pet.species)
  logger.info('RAG Phase 1: LLM keyword transformation', {
    sessionId: session.id,
    coreSymptoms: llmTransformResult.coreSymptoms,
    confidence: llmTransformResult.confidence,
  })

  // Step 2: M2 急症检测
  const triage = detectTriage(cleanText, pet.species, false)
  session.context.triageResult = triage
  events.push({ section: 'triage', data: triage, timestamp: now, isComplete: true })

  // Step 2a: 急症 → 终态
  // 急症不中断 —— 仍然继续执行诊断，但标记为急症状态
  const isEmergency = triage.level === 'critical'

  // Step 3: M3 症状归一化（规则引擎）
  const currentNormalized = normalize(cleanText, pet.species)
  const normalized = removeNegatedSymptoms(
    mergeNormalizedInput(session.context.normalizedInput, currentNormalized),
    cleanText
  )

  // 合并 LLM 关键词到归一化结果
  const affirmedCoreSymptoms = filterNegatedTerms(cleanText, llmTransformResult.coreSymptoms)
  for (const kw of affirmedCoreSymptoms) {
    const alreadyExists = normalized.chiefComplaint.some(s => s.name === kw) ||
      normalized.accompanyingSymptoms.some(s => s.name === kw)
    if (!alreadyExists) {
      normalized.accompanyingSymptoms.push({
        name: kw,
        original: `[LLM提取] ${kw}`,
        category: 'accompanying',
      })
    }
  }

  session.context.normalizedInput = normalized
  session.context.consultationState = mergeConsultationEvidence(
    session.context.consultationState || createInitialConsultationState({
      sessionId: session.id,
      petId: session.petId,
      species: pet.species === '猫' ? '猫' : '犬',
    }),
    {
      species: pet.species === '猫' ? '猫' : '犬',
      rawText: cleanText,
      confirmedSymptoms: [
        ...normalized.chiefComplaint.map((symptom) => symptom.name),
        ...normalized.accompanyingSymptoms.map((symptom) => symptom.name),
      ],
      deniedSymptoms: extractDeniedSymptoms(cleanText),
      unknownSymptoms: [],
    }
  )

  // 注入 session ID 供 interviewer 缓存隔离
  pipelineContext._sessionId = session.id

  // Step 3a: 症状过少 → 强制追问,不进入诊断
  if (normalized.chiefComplaint.length === 0 && normalized.accompanyingSymptoms.length === 0) {
    const emptyResult = {
      isComplete: false,
      missingFields: ['chiefComplaint'],
      questions: [{
        field: 'chiefComplaint',
        question: '请具体描述宠物出现了什么异常？比如：呕吐、腹泻、咳嗽、皮肤问题、排尿异常等。',
        guidance: '需要明确的核心症状才能进行疾病分析',
        priority: 1,
      }],
      roundsUsed: 0, skippedFields: [], uncollectableFields: [],
      mandatoryFieldsCompleted: [], mandatoryFieldsMissing: ['chiefComplaint'],
    }
    session.context.interviewResult = emptyResult
    events.push({ section: 'interview', data: emptyResult, timestamp: now, isComplete: true })
    transition(session, SessionState.FOLLOWUP_R1)
    saveSession(session)
    return { output: { triage, interview: emptyResult, sseEvents: events }, session }
  }

  // ================================================================
  // RAG 优化: Phase 2 — 归一化检验
  // 合并 LLM + 规则引擎的关键词，对照 KB 词汇表验证
  // ================================================================
  const ruleSymptomNames = [
    ...normalized.chiefComplaint.map(s => s.name),
    ...normalized.accompanyingSymptoms.map(s => s.name),
  ]
  const mergedKeywords = filterNegatedTerms(cleanText, mergeKeywords(llmTransformResult, ruleSymptomNames))

  let verificationResult: VerificationResult = verifyKeywords(
    mergedKeywords,
    pet.species
  )
  logger.info('RAG Phase 2: Normalization verification', {
    sessionId: session.id,
    totalKeywords: mergedKeywords.length,
    verifiedCount: verificationResult.verifiedTerms.length,
    unmappedCount: verificationResult.unmappedTerms.length,
    coverage: verificationResult.coverage,
  })

  // 覆盖率过低 → 用 KB 上下文提示重试一次 LLM 提取
  if (verificationResult.coverage < 0.3 && verificationResult.suggestionForRetry) {
    logger.warn('RAG: Low verification coverage, retrying LLM extraction with KB context', {
      sessionId: session.id,
      coverage: verificationResult.coverage,
    })
    const retryResult = await transformKeywords(
      `${cleanText}\n\n[系统提示：请使用以下标准兽医术语进行症状描述]\n${verificationResult.suggestionForRetry}`,
      pet.species
    )
    if (retryResult.coreSymptoms.length > 0) {
      const retryKeywords = retryResult.coreSymptoms
      verificationResult = verifyKeywords(retryKeywords, pet.species)
      logger.info('RAG: Retry verification result', {
        sessionId: session.id,
        retryCoverage: verificationResult.coverage,
      })
    }
  }

  // ================================================================
  // RAG 优化: Phase 3 — 带验证权重的 RAG 检索
  // ================================================================
  const verifiedTerms = verificationResult.verifiedTerms
  let kbResults = verifiedTerms.length > 0
    ? searchVerified(verifiedTerms, pet.species)
    : search(mergedKeywords, pet.species) // 回退到传统检索
  kbResults = kbResults.filter((result) => result.entry.species.includes(pet.species))

  const allKnowledge = loadAllKnowledge(pet.species)
  const routedPool = buildCandidatePool({
    species: pet.species,
    symptoms: mergedKeywords,
    rawText: cumulativeText,
    pet,
    entries: allKnowledge,
  })
  kbResults = mergeRoutedResults(routedPool.candidates.map(candidateToSearchResult), kbResults)
    .filter((result) => result.entry.species.includes(pet.species))

  // Step 5: 自适应鉴别追问
  const invalidCount = pipelineContext.invalidAnswerCount || 0
  const prevQuestions = pipelineContext.previousQuestions || []

  const assessedDiffResult = assessDifferential(
    session.context,
    kbResults,
    cumulativeText,
    invalidCount,
    prevQuestions
  )
  const diffResult = applyRoutedFollowup(assessedDiffResult, routedPool, isEmergency, prevQuestions, cumulativeText)

  if (session.context.consultationState) {
    session.context.consultationState = updateConsultationRouting(session.context.consultationState, {
      activeCategories: routedPool.categoryPath,
      candidatePool: routedPool.candidates.map(routedCandidateToRankedCandidate),
      pendingQuestions: diffResult.isComplete ? [] : diffResult.questions,
      roundsUsed: invalidCount + 1,
      decisionTrace: [{
        node: 'candidate_router',
        decision: diffResult.isComplete ? 'complete' : 'ask_followup',
        reason: diffResult.convergentCandidates.length > 0
          ? `收敛候选: ${diffResult.convergentCandidates.map(candidate => candidate.disease).join('、')}`
          : `候选数 ${routedPool.candidates.length}，追问数 ${diffResult.questions.length}`,
        at: now,
      }],
    })
  }

  // 存储追问状态
  pipelineContext.previousQuestions = [
    ...prevQuestions,
    ...diffResult.questions.map(q => q.question),
  ]
  pipelineContext.invalidAnswerCount = diffResult.newInvalidCount

  // 答非所问 → 中断,提示重新描述
  if (!isEmergency && diffResult.shouldRestart) {
    resetCandidateCache()
    transition(session, SessionState.COLLECTING) // 回到采集阶段
    const restartInterview = {
      isComplete: false,
      missingFields: [],
      questions: [],
      restartReason: diffResult.restartReason,
      roundsUsed: invalidCount + 1,
      skippedFields: [],
      uncollectableFields: [],
      mandatoryFieldsCompleted: session.context.mandatoryFieldsCompleted || [],
      mandatoryFieldsMissing: [],
    }
    events.push({
      section: 'interview',
      data: restartInterview,
      timestamp: now, isComplete: true,
    })
    saveSession(session)
    return { output: { triage, interview: restartInterview, sseEvents: events }, session }
  }

  // 信息不足 → 追问
  if (!isEmergency && !diffResult.isComplete) {
    const interviewResult = {
      isComplete: false,
      missingFields: [],
      questions: diffResult.questions,
      roundsUsed: invalidCount + 1,
      skippedFields: [],
      uncollectableFields: [],
      mandatoryFieldsCompleted: session.context.mandatoryFieldsCompleted || [],
      mandatoryFieldsMissing: [],
    }
    session.context.interviewResult = interviewResult
    events.push({ section: 'interview', data: interviewResult, timestamp: now, isComplete: true })

    transition(session, SessionState.FOLLOWUP_R1)
    saveSession(session)
    return { output: { triage, interview: interviewResult, sseEvents: events }, session }
  }

  // 收敛 → 输出候选结果
  if (diffResult.convergentCandidates.length > 0) {
    events.push({
      section: 'interview',
      data: { isComplete: true, convergentCandidates: diffResult.convergentCandidates },
      timestamp: now, isComplete: true,
    })
  }

  // 构建兼容的 interviewResult
  const interviewResult = {
    isComplete: isEmergency ? true : diffResult.isComplete,
    missingFields: [] as string[],
    questions: isEmergency ? [] : diffResult.questions,
    convergentCandidates: diffResult.convergentCandidates,
    roundsUsed: invalidCount + 1,
    skippedFields: [] as string[],
    uncollectableFields: [] as string[],
    mandatoryFieldsCompleted: session.context.mandatoryFieldsCompleted || [],
    mandatoryFieldsMissing: [] as string[],
  }

  // Step 6: M5 诊断引擎
  transition(session, SessionState.DIAGNOSING)
  const diagnosticResult = await diagnose(normalized, pet.species, interviewResult, cumulativeText, verifiedTerms, kbResults)
  events.push({
    section: 'diagnosis',
    data: {
      searchResults: diagnosticResult.searchResults,
      webSources: diagnosticResult.webSources,
    },
    timestamp: Date.now(),
    isComplete: true,
  })

  // Step 7: M6 置信度计算
  const searchResults = diagnosticResult.searchResults.length > 0
    ? diagnosticResult.searchResults
    : kbResults
  const topResult = searchResults[0]

  const toSymptomMatch = (result: typeof topResult): SymptomMatchInput =>
    result
      ? {
          matchRate: result.matchDetails.symptomOverlap / Math.max(1, result.entry.symptoms.primary.length + result.entry.symptoms.secondary.length),
          primaryHitRate: result.matchDetails.primaryHitRate,
          knowledgeConfidence: result.entry.confidence,
        }
      : {
          matchRate: 0,
          primaryHitRate: 0,
          knowledgeConfidence: 'low',
        }

  const symptomMatch: SymptomMatchInput = toSymptomMatch(topResult)
  const symptomMatchByDisease: Record<string, SymptomMatchInput & { isCrossSpecies?: boolean }> = {}
  for (const raw of diagnosticResult.rawDiagnoses) {
    const matchedResult = searchResults.find((result) =>
      raw.disease.includes(result.entry.disease) ||
      result.entry.disease.includes(raw.disease)
    )
    if (matchedResult) {
      symptomMatchByDisease[raw.disease] = {
        ...toSymptomMatch(matchedResult),
        isCrossSpecies: matchedResult.matchDetails.isCrossSpecies,
      }
    }
  }

  const infoCompleteness = calcInfoCompleteness(
    (session.context.mandatoryFieldsCompleted || []).length,
    9
  )

  const scoredDiagnoses = calculate(
    diagnosticResult.rawDiagnoses,
    symptomMatch,
    infoCompleteness,
    pet.species,
    topResult?.matchDetails.isCrossSpecies || false,
    interviewResult.uncollectableFields.length,
    diagnosticResult.source,
    symptomMatchByDisease
  )
  applyConvergenceConfidenceFloor(scoredDiagnoses, interviewResult.convergentCandidates, isEmergency)

  // Step 8: M7 报告生成
  const vetMap = isEmergency
    ? await findNearbyVetHospitals({ locationText: userText })
    : undefined

  const report = generateReport(
    triage,
    scoredDiagnoses,
    interviewResult,
    normalized,
    pet,
    diagnosticResult.source,
    diagnosticResult.webSources,
    {
      knowledgeEntries: searchResults.map((result) => result.entry),
      vetMap,
    }
  )
  session.context.report = report

  // 急症: 在报告最前面注入预警
  if (isEmergency && !report.sections.some((section) => section.type === 'emergency_signs')) {
    report.sections.unshift({
      type: 'emergency_signs',
      title: '⚠️ 紧急就医预警',
      content: `急症评分: ${triage.score}/100\n匹配急症信号: ${triage.matchedSignals.join('、')}\n\n请**立即**携带宠物前往24小时宠物医院急诊。以下为基于症状的可能疾病分析，供就医时向兽医描述参考。`,
    })
  }

  events.push({ section: 'report', data: report, timestamp: Date.now(), isComplete: true })

  // 终态
  if (isEmergency) {
    transition(session, SessionState.EMERGENCY_TRIGGERED)
  } else if (report.template === 'template_4') {
    transition(session, SessionState.INCOMPLETE)
  } else {
    transition(session, SessionState.REPORTED)
  }

  saveSession(session)
  return { output: { triage, interview: interviewResult, report, sseEvents: events }, session }
}

type DifferentialResult = ReturnType<typeof assessDifferential>
type RoutedPool = ReturnType<typeof buildCandidatePool>

function candidateToSearchResult(candidate: RoutedPool['candidates'][number]): SearchResult {
  const primaryHits = candidate.entry.symptoms.primary.filter((symptom) =>
    candidate.coherence.matchedSymptoms.includes(symptom) ||
    candidate.coherence.matchedSymptoms.some((matched) => matched.includes(symptom) || symptom.includes(matched))
  ).length

  return {
    entry: candidate.entry,
    score: Math.max(0.01, Math.round(candidate.score) / 100),
    matchDetails: {
      symptomOverlap: candidate.coherence.matchedSymptoms.length,
      primaryHitRate: Math.round((primaryHits / Math.max(1, candidate.entry.symptoms.primary.length)) * 100) / 100,
      isCrossSpecies: false,
    },
  }
}

function routedCandidateToRankedCandidate(candidate: RoutedPool['candidates'][number]): RankedDiseaseCandidate {
  const primarySymptoms = new Set(candidate.entry.symptoms.primary)
  const secondarySymptoms = new Set(candidate.entry.symptoms.secondary)
  const matched = candidate.coherence.matchedSymptoms
  const keySymptoms = candidate.entry.key_symptoms || []

  return {
    disease: candidate.entry.disease,
    score: candidate.score,
    reason: candidate.coherence.reason,
    matchedCore: matched.filter((symptom) =>
      primarySymptoms.has(symptom) ||
      keySymptoms.some((keySymptom) => keySymptom.term === symptom && keySymptom.weight === 'core')
    ),
    matchedSecondary: matched.filter((symptom) =>
      !primarySymptoms.has(symptom) && secondarySymptoms.has(symptom)
    ),
    matchedRisks: candidate.coherence.matchedRiskFactors,
    deniedCore: candidate.coherence.explicitCounterEvidence,
    missingCore: keySymptoms
      .filter((keySymptom) => keySymptom.weight === 'core')
      .map((keySymptom) => keySymptom.term)
      .filter((term) => !matched.includes(term)),
  }
}

function mergeRoutedResults(
  routedResults: SearchResult[],
  ragResults: SearchResult[]
): SearchResult[] {
  const byId = new Map<string, SearchResult>()

  for (const result of [...routedResults, ...ragResults]) {
    const existing = byId.get(result.entry.id)
    if (!existing || result.score > existing.score) {
      byId.set(result.entry.id, result)
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
}

function applyRoutedFollowup(
  diffResult: DifferentialResult,
  routedPool: RoutedPool,
  isEmergency: boolean,
  previousQuestions: string[],
  cumulativeText: string
): DifferentialResult {
  const config = getConsultationConfig()
  const top = routedPool.candidates[0]
  const previousQuestionCount = previousQuestions.length
  const askedQuestions = new Set(previousQuestions)
  const freshRoutedQuestions = routedPool.nextQuestions.filter((question) =>
    !askedQuestions.has(question.question) || !hasAnswerForRouteQuestion(question.field, cumulativeText)
  )
  if (top && isEmergency && top.score >= config.convergence.postFollowupCandidateScore) {
    return {
      ...diffResult,
      isComplete: true,
      questions: [],
      convergentCandidates: [{
        disease: top.entry.disease,
        score: top.score,
        reason: top.coherence.reason,
      }],
    }
  }

  if (isEmergency) return diffResult

  if (
    top &&
    previousQuestionCount > 0 &&
    hasStrongPostFollowupEvidence(cumulativeText)
  ) {
    return {
      ...diffResult,
      isComplete: true,
      questions: [],
      convergentCandidates: buildConvergentRangeFromPool(routedPool, config),
    }
  }

  if (previousQuestionCount === 0 && freshRoutedQuestions.length > 0) {
    return {
      ...diffResult,
      isComplete: false,
      questions: mergeFollowupQuestions(freshRoutedQuestions, diffResult.questions),
      convergentCandidates: [],
    }
  }

  if (top && previousQuestionCount > 0 && top.score >= config.convergence.postFollowupCandidateScore) {
    return {
      ...diffResult,
      isComplete: true,
      questions: [],
      convergentCandidates: [{
        disease: top.entry.disease,
        score: top.score,
        reason: top.coherence.reason,
      }],
    }
  }

  if (top && !routedPool.requiresFollowup && top.score >= config.convergence.postFollowupCandidateScore) {
    return {
      ...diffResult,
      isComplete: true,
      questions: [],
      convergentCandidates: [{
        disease: top.entry.disease,
        score: top.score,
        reason: top.coherence.reason,
      }],
    }
  }

  if (!routedPool.requiresFollowup || freshRoutedQuestions.length === 0) {
    return diffResult
  }

  return {
    ...diffResult,
    isComplete: false,
    questions: mergeFollowupQuestions(freshRoutedQuestions, diffResult.questions),
    convergentCandidates: [],
  }
}

function hasStrongPostFollowupEvidence(text: string): boolean {
  return /弓背|祈祷|疼得厉害|痛得厉害|剧烈腹痛|肥肉|油炸|高脂肪|完全不吃|食欲废绝|尿不出|无尿|血便|黑便|番茄|腥臭|呼吸困难|发紫|抽搐|休克|黄疸/.test(text)
}

function buildConvergentRangeFromPool(
  routedPool: RoutedPool,
  config: ReturnType<typeof getConsultationConfig>
): Array<{ disease: string; score: number; reason: string }> {
  const top = routedPool.candidates[0]
  if (!top) return []

  const range = routedPool.candidates
    .filter((candidate) =>
      candidate.score >= config.interview.closeCandidateScore &&
      top.score - candidate.score <= Math.max(config.convergence.clearLeadGap, 20)
    )
    .slice(0, config.convergence.testOnlyCandidateLimit)
    .map((candidate) => ({
      disease: candidate.entry.disease,
      score: candidate.score,
      reason: candidate.coherence.reason,
    }))

  if (range.length > 0) return range

  return [{
    disease: top.entry.disease,
    score: top.score,
    reason: top.coherence.reason,
  }]
}

function hasAnswerForRouteQuestion(field: string, text: string): boolean {
  if (field.startsWith('q_') || field.startsWith('key_') || field.startsWith('symptom_')) {
    return hasAnswerForDynamicSymptomQuestion(field, text)
  }

  if (field === 'infectious_risk') {
    return /年龄|月龄|疫苗|打完|没打|未完成|接触|玩过|宠物店|犬舍|寄养|病犬|病猫|其他动物/.test(text)
  }
  if (field === 'infectious_gi_signs') {
    return /发热|发烧|没有发热|无发热|不发烧|呕吐|吐|不吐|没有呕吐|无呕吐|血便|便血|拉血|黑便|没有血便|无血便|不带血|腥臭|臭味|不臭|精神|没精神|饮水|脱水|水样/.test(text)
  }
  if (field === 'diet_toxin_foreign_body') {
    return /换粮|高脂|肥肉|油炸|剩饭|骨头|垃圾|异物|玩具|巧克力|葡萄|洋葱|防冻液|人用药|没吃|没有吃|没换/.test(text)
  }
  if (field === 'stool_shape') {
    return /水样|软便|黏液|虫|血便|便血|黑便|次数|一天|几次|普通软便/.test(text)
  }
  if (field === 'parasite_risk') {
    return /驱虫|虫体|米粒|节片|消瘦|被毛/.test(text)
  }
  if (field === 'reproductive_scope') {
    return /绝育|发情|交配|怀孕|产后|阴道|分泌物/.test(text)
  }

  return false
}

function hasAnswerForDynamicSymptomQuestion(field: string, text: string): boolean {
  const normalizedField = field.replace(/^q_[^_]+_/, '').replace(/^key_[^_]+_/, '').replace(/^symptom_[^_]+_/, '')
  const combined = `${normalizedField} ${text}`

  if (/剧烈腹痛|腹痛/.test(combined)) {
    return /剧烈腹痛|腹痛|肚子疼|肚子痛|疼得厉害|痛得厉害|很疼|很痛|不让碰/.test(text)
  }
  if (/弓背|祈祷/.test(combined)) {
    return /弓背|祈祷|趴着|撅屁股/.test(text)
  }
  if (/高脂肪|肥肉|油炸|油腻/.test(combined)) {
    return /高脂肪|肥肉|油炸|油腻|吃油|吃了肉/.test(text)
  }
  if (/食欲废绝|食欲/.test(combined)) {
    return /食欲|完全不吃|一点不吃|不吃不喝|绝食|没胃口|不吃/.test(text)
  }
  if (/剧烈呕吐|呕吐|吐/.test(combined)) {
    return /呕吐|吐|干呕|一直吐|频繁吐|不停吐|喝水也吐|不吐|没有呕吐/.test(text)
  }
  if (/血便|黑便|番茄|腥臭/.test(combined)) {
    return /血便|便血|拉血|黑便|番茄|腥臭|臭味|不臭|没有血便|无血便|没有腥臭/.test(text)
  }
  if (/排尿|尿不出|无尿|少尿/.test(combined)) {
    return /尿|猫砂|排尿|尿不出|无尿|少尿|几滴|没有尿/.test(text)
  }

  const compactSymptom = normalizedField.replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '')
  return compactSymptom.length >= 2 && text.replace(/\s+/g, '').includes(compactSymptom)
}

function mergeFollowupQuestions(
  first: DifferentialResult['questions'],
  second: DifferentialResult['questions']
): DifferentialResult['questions'] {
  const seen = new Set<string>()
  return [...first, ...second]
    .filter((question) => {
      if (seen.has(question.question)) return false
      seen.add(question.question)
      return true
    })
    .slice(0, 4)
}

function extractDeniedSymptoms(text: string): string[] {
  const denied: string[] = []
  const aliases: Array<{ symptom: string; terms: string[] }> = [
    { symptom: '呕吐', terms: ['呕吐', '吐', '干呕'] },
    { symptom: '发热', terms: ['发热', '发烧', '高烧', '体温高'] },
    { symptom: '腹泻', terms: ['腹泻', '拉稀', '拉肚子', '软便'] },
    { symptom: '血便', terms: ['血便', '便血', '拉血', '黑便'] },
    { symptom: '精神萎靡', terms: ['精神差', '没精神', '萎靡', '嗜睡'] },
    { symptom: '食欲下降', terms: ['不吃', '食欲差', '食欲下降', '没胃口'] },
  ]

  for (const item of aliases) {
    if (item.terms.some((term) => isNegatedTerm(text, term))) {
      denied.push(item.symptom)
    }
  }

  return Array.from(new Set(denied))
}

function applyConvergenceConfidenceFloor(
  diagnoses: ReturnType<typeof calculate>,
  convergentCandidates: Array<{ disease: string; score: number }> | undefined,
  isEmergency: boolean
): void {
  const config = getConsultationConfig()
  if (!isEmergency) return
  if (!convergentCandidates || convergentCandidates.length === 0) return

  for (const diagnosis of diagnoses) {
    const convergent = convergentCandidates.find((candidate) =>
      diagnosis.disease.includes(candidate.disease) ||
      candidate.disease.includes(diagnosis.disease)
    )
    if (!convergent || convergent.score < config.convergence.highConfidenceScore) continue
    diagnosis.confidence = Math.max(diagnosis.confidence, Math.round(convergent.score))
    if (diagnosis.confidence >= 80) {
      diagnosis.badge = 'green' as typeof diagnosis.badge
    } else if (diagnosis.confidence >= 65) {
      diagnosis.badge = 'yellow' as typeof diagnosis.badge
    }
  }
}
