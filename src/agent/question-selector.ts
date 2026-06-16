import type { KnowledgeEntry, StructuredKeySymptom } from '@/knowledge/types'
import type { FollowUpQuestion } from './types'
import type { RankedDiseaseCandidate } from './candidate-ranker'

export interface SelectNextQuestionsInput {
  rankedCandidates: RankedDiseaseCandidate[]
  askedQuestions?: string[]
  confirmedSymptoms?: string[]
  deniedSymptoms?: string[]
  maxQuestions?: number
}

export interface PendingQuestion extends FollowUpQuestion {
  symptom: string
  informationGain: number
  yesDiseaseIds: string[]
  noDiseaseIds: string[]
  observable: boolean
}

interface QuestionSignal {
  candidate: RankedDiseaseCandidate
  symptom: string
  ask: string
  weight: 'core' | 'major' | 'minor'
  source: 'key_symptom' | 'primary' | 'secondary'
}

const HOSPITAL_ONLY_PATTERN = /血常规|血生化|生化|白细胞|中性粒|PCR|抗原|抗体|试纸|检测|检查|化验|尿检|粪检|影像|超声|B超|X光|CT|MRI|内镜|穿刺|培养|药敏|cPL|fPL|胰腺特异性脂肪酶/i
const OBSERVABLE_PATTERN = /呕吐|吐|腹泻|拉稀|血便|黑便|番茄|腥臭|尿|无尿|尿不出|排尿|咳嗽|喷嚏|鼻涕|呼吸|喘|抽搐|发热|体温|精神|食欲|饮水|腹痛|弓背|祈祷|瘙痒|抓挠|脱毛|流泪|眼屎|耳臭|跛|瘸|疼|肿|分泌物|发紫|牙龈/
const DISCRIMINATIVE_PATTERN = /无尿|尿不出|血便|黑便|番茄|腥臭|剧烈|腹痛|弓背|祈祷|高脂肪|肥肉|油炸|呼吸困难|发紫|抽搐|休克|虚脱|黄疸|中毒|百合|葡萄|洋葱/
const GENERIC_PATTERN = /腹泻|呕吐|食欲下降|精神萎靡|精神差|软便/

export function selectNextQuestions(input: SelectNextQuestionsInput): PendingQuestion[] {
  const candidates = input.rankedCandidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  if (candidates.length < 2) return []

  const asked = new Set(input.askedQuestions || [])
  const confirmed = input.confirmedSymptoms || []
  const denied = input.deniedSymptoms || []

  const signals = candidates.flatMap((candidate) => collectSignals(candidate))
  const questions = signals
    .filter((signal) => !isHospitalOnly(signal.symptom, signal.ask))
    .filter((signal) => !asked.has(signal.ask))
    .filter((signal) => !isAnswered(signal.symptom, confirmed, denied))
    .map((signal) => buildQuestion(signal, candidates))
    .filter((question): question is PendingQuestion => question !== null)

  const deduped = dedupeQuestions(questions)
  deduped.sort((a, b) => {
    if (b.informationGain !== a.informationGain) return b.informationGain - a.informationGain
    return a.priority - b.priority
  })

  return deduped.slice(0, input.maxQuestions ?? 3)
}

function collectSignals(candidate: RankedDiseaseCandidate): QuestionSignal[] {
  const keySignals: QuestionSignal[] = (candidate.entry.key_symptoms || []).map((symptom) => ({
    candidate,
    symptom: symptom.term,
    ask: symptom.ask,
    weight: symptom.weight,
    source: 'key_symptom',
  }))

  const keyed = new Set(keySignals.map((signal) => normalize(signal.symptom)))
  const primarySignals = candidate.entry.symptoms.primary
    .filter((symptom) => !keyed.has(normalize(symptom)))
    .map((symptom) => ({
      candidate,
      symptom,
      ask: defaultQuestion(symptom),
      weight: 'core' as const,
      source: 'primary' as const,
    }))
  const secondarySignals = candidate.entry.symptoms.secondary
    .filter((symptom) => !keyed.has(normalize(symptom)))
    .map((symptom) => ({
      candidate,
      symptom,
      ask: defaultQuestion(symptom),
      weight: 'major' as const,
      source: 'secondary' as const,
    }))

  return [...keySignals, ...primarySignals, ...secondarySignals]
}

function buildQuestion(
  signal: QuestionSignal,
  candidates: RankedDiseaseCandidate[]
): PendingQuestion | null {
  const yesDiseaseIds = candidates
    .filter((candidate) => entryHasSignal(candidate.entry, signal.symptom))
    .map((candidate) => candidate.entry.id)
  const noDiseaseIds = candidates
    .filter((candidate) => !yesDiseaseIds.includes(candidate.entry.id))
    .map((candidate) => candidate.entry.id)

  if (yesDiseaseIds.length === 0 || noDiseaseIds.length === 0) return null

  const observable = isObservable(signal.symptom, signal.ask)
  if (!observable && signal.weight !== 'core') return null

  const informationGain = calculateInformationGain(signal, candidates, yesDiseaseIds, noDiseaseIds, observable)
  const priority = calculatePriority(signal, observable)

  return {
    field: `q_${signal.candidate.entry.id}_${normalize(signal.symptom)}`,
    question: signal.ask,
    guidance: `用于区分${diseaseNames(candidates, yesDiseaseIds)}与${diseaseNames(candidates, noDiseaseIds)}`,
    priority,
    symptom: signal.symptom,
    informationGain,
    yesDiseaseIds,
    noDiseaseIds,
    observable,
  }
}

function calculateInformationGain(
  signal: QuestionSignal,
  candidates: RankedDiseaseCandidate[],
  yesDiseaseIds: string[],
  noDiseaseIds: string[],
  observable: boolean
): number {
  const yesScore = scoreSum(candidates, yesDiseaseIds)
  const noScore = scoreSum(candidates, noDiseaseIds)
  const balance = Math.min(yesScore, noScore)
  const leaderBonus = yesDiseaseIds.includes(signal.candidate.entry.id) ? signal.candidate.score / 10 : 0
  const weightBonus = signal.weight === 'core' ? 16 : signal.weight === 'major' ? 10 : 4
  const observableBonus = observable ? 8 : 0
  const discriminativeBonus = DISCRIMINATIVE_PATTERN.test(`${signal.symptom} ${signal.ask}`) ? 18 : 0
  const genericPenalty = GENERIC_PATTERN.test(signal.symptom) ? 8 : 0

  return Math.round(balance + leaderBonus + weightBonus + observableBonus + discriminativeBonus - genericPenalty)
}

function calculatePriority(signal: QuestionSignal, observable: boolean): number {
  let priority = signal.weight === 'core' ? 2 : signal.weight === 'major' ? 3 : 4
  if (observable) priority -= 1
  if (DISCRIMINATIVE_PATTERN.test(`${signal.symptom} ${signal.ask}`)) priority -= 1
  if (signal.candidate.entry.urgency === 'critical') priority -= 1
  return Math.max(1, priority)
}

function entryHasSignal(entry: KnowledgeEntry, symptom: string): boolean {
  const target = normalize(symptom)
  const terms = [
    ...(entry.key_symptoms || []).map((item: StructuredKeySymptom) => item.term),
    ...entry.symptoms.primary,
    ...entry.symptoms.secondary,
  ]

  return terms.some((term) => {
    const normalized = normalize(term)
    return normalized === target || normalized.includes(target) || target.includes(normalized)
  })
}

function isHospitalOnly(symptom: string, ask: string): boolean {
  return HOSPITAL_ONLY_PATTERN.test(`${symptom} ${ask}`)
}

function isObservable(symptom: string, ask: string): boolean {
  return OBSERVABLE_PATTERN.test(`${symptom} ${ask}`) && !isHospitalOnly(symptom, ask)
}

function isAnswered(symptom: string, confirmed: string[], denied: string[]): boolean {
  const target = normalize(symptom)
  return [...confirmed, ...denied].some((item) => {
    const normalized = normalize(item)
    return normalized === target || normalized.includes(target) || target.includes(normalized)
  })
}

function scoreSum(candidates: RankedDiseaseCandidate[], ids: string[]): number {
  return candidates
    .filter((candidate) => ids.includes(candidate.entry.id))
    .reduce((sum, candidate) => sum + candidate.score, 0)
}

function diseaseNames(candidates: RankedDiseaseCandidate[], ids: string[]): string {
  return candidates
    .filter((candidate) => ids.includes(candidate.entry.id))
    .slice(0, 3)
    .map((candidate) => `「${candidate.entry.disease}」`)
    .join('、') || '其他候选'
}

function dedupeQuestions(questions: PendingQuestion[]): PendingQuestion[] {
  const byQuestion = new Map<string, PendingQuestion>()
  for (const question of questions) {
    const existing = byQuestion.get(question.question)
    if (!existing || question.informationGain > existing.informationGain) {
      byQuestion.set(question.question, question)
    }
  }
  return Array.from(byQuestion.values())
}

function defaultQuestion(symptom: string): string {
  return `宠物有没有出现「${symptom}」？`
}

function normalize(value: string): string {
  return value
    .replace(/[（(].*?[）)]/g, '')
    .replace(/\s+/g, '')
    .trim()
}
