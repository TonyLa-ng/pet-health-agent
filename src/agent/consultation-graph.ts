import type { PetProfile, Session } from '@/store/types'
import type { ClinicalReport, TriageResult, AssessmentResult } from './types'
import { detectSpeciesMismatch } from '@/species'
import { guardInput } from '@/compliance/input-guard'
import { normalize } from '@/knowledge/normalizer'
import { loadAllKnowledge } from '@/knowledge/loader'
import { detectTriage } from './triage'
import { buildCandidatePool } from './differential-router'
import { isNegatedTerm } from './negation'
import { getConsultationConfig } from './consultation-config'
import {
  createInitialConsultationState,
  mergeConsultationEvidence,
  updateConsultationRouting,
  type ConsultationState,
  type ConsultationSpecies,
  type DecisionTraceItem,
  type RankedDiseaseCandidate as StateRankedDiseaseCandidate,
} from './consultation-state'

export interface ConsultationGraphInput {
  session: Session
  pet: PetProfile
  latestUserText: string
  state?: ConsultationState
}

export interface ConsultationGraphResult {
  triage: TriageResult
  interview?: AssessmentResult
  report?: ClinicalReport
  state: ConsultationState
  decisionTrace: DecisionTraceItem[]
  blocked: boolean
  shouldDiagnose: boolean
  convergentCandidates: Array<{ disease: string; score: number; reason: string }>
}

export async function runConsultationGraph(input: ConsultationGraphInput): Promise<ConsultationGraphResult> {
  const now = Date.now()
  const species = toConsultationSpecies(input.pet.species)
  let state = input.state || createInitialConsultationState({
    sessionId: input.session.id,
    petId: input.pet.id,
    species,
  })
  const trace: DecisionTraceItem[] = []
  const addTrace = (node: string, decision: string, reason: string) => {
    trace.push({ node, decision, reason, at: now })
  }

  const mismatch = detectSpeciesMismatch(input.latestUserText, species)
  if (mismatch) {
    addTrace('species_guard', 'blocked', mismatch.message)
    const interview = buildInterview([{
      field: 'species_switch',
      question: mismatch.message,
      guidance: '先确认犬猫问诊入口，避免跨物种链路误判',
      priority: 1,
    }], 0)
    state = updateConsultationRouting(state, {
      activeCategories: [],
      candidatePool: [],
      pendingQuestions: interview.questions,
      decisionTrace: trace,
    })
    return {
      triage: normalTriage(),
      interview,
      state,
      decisionTrace: trace,
      blocked: true,
      shouldDiagnose: false,
      convergentCandidates: [],
    }
  }
  addTrace('species_guard', 'passed', `入口物种为${species}`)

  const compliance = guardInput(input.latestUserText, input.session.id)
  if (compliance.blocked) {
    addTrace('input_guard', 'blocked', '输入内容触发合规拦截')
    const interview = buildInterview([], state.roundsUsed)
    state = updateConsultationRouting(state, {
      activeCategories: [],
      candidatePool: [],
      pendingQuestions: [],
      decisionTrace: trace,
    })
    return {
      triage: normalTriage(),
      interview,
      state,
      decisionTrace: trace,
      blocked: true,
      shouldDiagnose: false,
      convergentCandidates: [],
    }
  }
  addTrace('input_guard', 'passed', '输入可进入问诊')

  const cleanText = compliance.maskedText
  const normalized = normalize(cleanText, species)
  const confirmedSymptoms = [
    ...normalized.chiefComplaint.map((symptom) => symptom.name),
    ...normalized.accompanyingSymptoms.map((symptom) => symptom.name),
  ].filter((symptom) => !isNegatedTerm(cleanText, symptom))
  const deniedSymptoms = extractDeniedSymptoms(cleanText)
  state = mergeConsultationEvidence(state, {
    species,
    rawText: cleanText,
    confirmedSymptoms,
    deniedSymptoms,
    unknownSymptoms: [],
  })
  addTrace('normalize', 'completed', `确认症状 ${confirmedSymptoms.length} 个，否认证据 ${deniedSymptoms.length} 个`)

  const triage = detectTriage(cleanText, species, false)
  addTrace('triage', triage.level, `急症评分 ${triage.score}`)

  if (confirmedSymptoms.length === 0) {
    const interview = buildInterview([{
      field: 'chiefComplaint',
      question: '请具体描述宠物出现了什么异常？比如呕吐、腹泻、咳嗽、皮肤问题或排尿异常。',
      guidance: '需要明确核心症状才能进入疾病候选筛选',
      priority: 1,
    }], state.roundsUsed)
    addTrace('category', 'insufficient_input', '没有可用症状')
    addTrace('retrieve', 'skipped', '没有可用于召回的症状')
    addTrace('rank', 'skipped', '没有候选')
    addTrace('question_select', 'ask_chief_complaint', '追问核心症状')
    addTrace('converge', 'not_ready', '信息不足')
    state = updateConsultationRouting(state, {
      activeCategories: [],
      candidatePool: [],
      pendingQuestions: interview.questions,
      roundsUsed: state.roundsUsed,
      decisionTrace: trace,
    })
    return {
      triage,
      interview,
      state,
      decisionTrace: trace,
      blocked: false,
      shouldDiagnose: false,
      convergentCandidates: [],
    }
  }

  const knowledge = loadAllKnowledge(species)
  const pool = buildCandidatePool({
    species,
    symptoms: confirmedSymptoms,
    rawText: state.rawTurns.join('\n'),
    pet: input.pet,
    entries: knowledge,
  })
  addTrace('category', 'completed', pool.categoryPath.join(' / ') || '未命中大类')
  addTrace('retrieve', 'completed', `召回知识条目 ${knowledge.length} 条`)
  addTrace('rank', 'completed', `候选 ${pool.candidates.length} 个`)

  const config = getConsultationConfig(species)
  const top = pool.candidates[0]
  const isEmergency = triage.level === 'critical'
  const canConverge =
    !!top &&
    (isEmergency || (!pool.requiresFollowup && top.score >= config.convergence.postFollowupCandidateScore))
  const questions = isEmergency || canConverge ? [] : pool.nextQuestions
  addTrace('question_select', questions.length > 0 ? 'ask_followup' : 'no_question', `追问 ${questions.length} 个`)

  const convergentCandidates = canConverge && top
    ? [{ disease: top.entry.disease, score: top.score, reason: top.coherence.reason }]
    : []
  addTrace(
    'converge',
    convergentCandidates.length > 0 ? 'ready_to_diagnose' : 'not_ready',
    convergentCandidates.length > 0
      ? `收敛到 ${convergentCandidates[0].disease}`
      : `最高候选分 ${top?.score ?? 0}`
  )

  const interview = buildInterview(questions, state.roundsUsed + 1, convergentCandidates)
  state = updateConsultationRouting(state, {
    activeCategories: pool.categoryPath,
    candidatePool: pool.candidates.map(toStateCandidate),
    pendingQuestions: questions,
    roundsUsed: state.roundsUsed + 1,
    decisionTrace: trace,
  })

  return {
    triage,
    interview: questions.length > 0 || convergentCandidates.length > 0 ? interview : undefined,
    state,
    decisionTrace: trace,
    blocked: false,
    shouldDiagnose: canConverge,
    convergentCandidates,
  }
}

function buildInterview(
  questions: AssessmentResult['questions'],
  roundsUsed: number,
  convergentCandidates: Array<{ disease: string; score: number; reason: string }> = []
): AssessmentResult {
  return {
    isComplete: questions.length === 0,
    missingFields: [],
    questions,
    convergentCandidates,
    roundsUsed,
    skippedFields: [],
    uncollectableFields: [],
    mandatoryFieldsCompleted: questions.length === 0 ? ['chiefComplaint'] : [],
    mandatoryFieldsMissing: questions.length > 0 ? ['followup'] : [],
  }
}

function toStateCandidate(candidate: ReturnType<typeof buildCandidatePool>['candidates'][number]): StateRankedDiseaseCandidate {
  return {
    disease: candidate.entry.disease,
    score: candidate.score,
    reason: candidate.coherence.reason,
    matchedCore: candidate.ranking.matchedCore,
    matchedSecondary: candidate.ranking.matchedSecondary,
    matchedRisks: candidate.ranking.matchedRisks,
    deniedCore: candidate.ranking.deniedCore,
    missingCore: candidate.ranking.missingCore,
  }
}

function toConsultationSpecies(species: PetProfile['species']): ConsultationSpecies {
  return species === '猫' ? '猫' : '犬'
}

function normalTriage(): TriageResult {
  return {
    isEmergency: false,
    level: 'normal',
    score: 0,
    alerts: [],
    matchedSignals: [],
    durationExtracted: 'unknown',
    durationConflict: false,
    durationEffect: 'neutral',
    isRevisit: false,
    lowRiskReminder: false,
  }
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
