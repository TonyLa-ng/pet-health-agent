import type { FollowUpQuestion } from './types'
import type { KnowledgeEntry } from '@/knowledge/types'
import { getConsultationConfig, type ConsultationConfig } from './consultation-config'
import {
  rankSingleCandidate,
  symptomMatches,
  type CandidateCoherence,
  type CandidateCoherenceInput,
  type RankedDiseaseCandidate,
} from './candidate-ranker'
import { selectNextQuestions } from './question-selector'
import {
  classifyCategoryPath as classifyConsultationCategoryPath,
  isEntryInCategoryPath,
  isInfectiousExposure,
  isToxinExposure,
  type CategoryClassifierPet,
  type ConsultationRouteSpecies,
} from './category-classifier'

type Species = ConsultationRouteSpecies

interface CandidatePoolPet extends CategoryClassifierPet {
  vaccination?: string
  age?: number
}

export interface CandidatePoolInput {
  species: Species
  symptoms: string[]
  rawText: string
  pet?: CandidatePoolPet
  entries: KnowledgeEntry[]
  maxCandidates?: number
}

export type { CandidateCoherence, CandidateCoherenceInput } from './candidate-ranker'

export interface RoutedCandidate {
  entry: KnowledgeEntry
  score: number
  coherence: CandidateCoherence
  ranking: RankedDiseaseCandidate
}

export interface CandidatePool {
  categoryPath: string[]
  candidates: RoutedCandidate[]
  nextQuestions: FollowUpQuestion[]
  requiresFollowup: boolean
  fallbackLevel: number
}

export function buildCandidatePool(input: CandidatePoolInput): CandidatePool {
  const config = getConsultationConfig(input.species)
  const maxCandidates = input.maxCandidates ?? 50
  const categoryClassification = classifyConsultationCategoryPath({
    species: input.species,
    symptoms: input.symptoms,
    rawText: input.rawText,
    pet: input.pet,
  })
  const categoryPath = categoryClassification.categoryPath
  const text = buildText(input.symptoms, input.rawText)

  let candidates = input.entries
    .filter((entry) => entry.species.includes(input.species))
    .filter((entry) => shouldEnterCandidatePool(entry, categoryPath, text, input.pet))
    .map((entry) => {
      const ranking = rankSingleCandidate({
        entry,
        symptoms: input.symptoms,
        rawText: input.rawText,
        categoryPath,
      })
      return { entry, coherence: ranking.coherence, score: ranking.score, ranking }
    })
    .filter((candidate) => candidate.score >= config.candidate.candidateMinimumScore || isEntryInCategoryPath(candidate.entry, categoryPath))

  if (candidates.length < 3) {
    candidates = [
      ...candidates,
      ...input.entries
        .filter((entry) => entry.species.includes(input.species))
        .filter((entry) => !candidates.some((candidate) => candidate.entry.id === entry.id))
        .map((entry) => {
          const ranking = rankSingleCandidate({
            entry,
            symptoms: input.symptoms,
            rawText: input.rawText,
            categoryPath,
          })
          return { entry, coherence: ranking.coherence, score: ranking.score, ranking }
        })
        .filter((candidate) => candidate.score >= config.candidate.fallbackMinimumScore),
    ]
  }

  candidates.sort((a, b) => b.score - a.score)
  const topCandidates = candidates.slice(0, maxCandidates)

  return {
    categoryPath,
    candidates: topCandidates,
    nextQuestions: buildNextQuestions(input.species, categoryPath, topCandidates, input.rawText, input.pet),
    requiresFollowup: shouldRequireFollowup(topCandidates, input.rawText, config),
    fallbackLevel: candidates.length >= 3 ? 0 : 1,
  }
}

export function classifyCategoryPath(
  symptoms: string[],
  rawText: string,
  pet?: CandidatePoolPet,
  species: Species = '犬'
): string[] {
  return classifyConsultationCategoryPath({ species, symptoms, rawText, pet }).categoryPath
}

export function scoreCandidateCoherence(input: CandidateCoherenceInput): CandidateCoherence {
  return rankSingleCandidate(input).coherence
}

function shouldEnterCandidatePool(
  entry: KnowledgeEntry,
  categoryPath: string[],
  text: string,
  pet?: CandidatePoolPet
): boolean {
  if (isEntryInCategoryPath(entry, categoryPath)) return true
  if (entry.category === '传染病' && isInfectiousExposure(text)) return true
  if (entry.category === '中毒' && isToxinExposure(text)) return true
  if (entry.category === '产科' && pet?.gender === 'female' && pet.neutered !== true) return true
  return buildEntryTerms(entry).some((term) => symptomMatches(term, text, []))
}

function buildNextQuestions(
  species: Species,
  categoryPath: string[],
  candidates: RoutedCandidate[],
  rawText: string,
  pet?: CandidatePoolPet
): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = []
  const text = rawText
  const hasDiarrheaChief = /腹泻|拉稀|拉肚子|水样便|血便|黑便|软便/.test(text)
  const infectiousDominant = candidates[0]?.entry.category === '传染病' || isInfectiousExposure(text)
  const infectiousPlace = species === '猫'
    ? '病猫、猫舍、多猫环境、寄养、宠物店或其他动物'
    : '病犬、犬舍、寄养、宠物店或其他动物'
  const infectiousDifferential = species === '猫'
    ? '猫瘟、猫冠状、细菌性肠炎和寄生虫'
    : '细小、冠状、细菌性肠炎和寄生虫'
  const toxinExamples = species === '猫'
    ? '换粮、罐头/冻干变化、翻垃圾桶、误食玩具异物，或接触百合花、洋葱/大蒜、巧克力、人用药、犬用驱虫药'
    : '换粮、吃高脂肪食物（肥肉/油炸）、剩饭/骨头、翻垃圾桶、误食玩具异物，或接触巧克力、葡萄、洋葱、防冻液、人用药'
  const femaleLabel = species === '猫' ? '母猫' : '母犬'

  if (categoryPath.includes('传染病') && (infectiousDominant || hasDiarrheaChief)) {
    questions.push({
      field: 'infectious_risk',
      question: `请补充：年龄多大、疫苗是否打完，7-14天内是否接触过${infectiousPlace}？`,
      guidance: '先判断是否进入传染病高风险队列',
      priority: 1,
    })
    questions.push({
      field: 'infectious_gi_signs',
      question: '有没有发热、反复呕吐、血便/黑便、番茄酱样或特别腥臭的腹泻？精神和饮水情况怎么样？',
      guidance: `用于区分${infectiousDifferential}`,
      priority: 1,
    })
  }

  if (categoryPath.includes('消化系统')) {
    questions.push({
      field: 'diet_toxin_foreign_body',
      question: `最近有没有${toxinExamples}？`,
      guidance: '用于排除饮食性肠胃炎、异物梗阻和中毒',
      priority: 1,
    })
    questions.push({
      field: 'stool_shape',
      question: '粪便是水样、黏液、带虫体、带血、黑便，还是普通软便？一天大概几次？',
      guidance: '粪便形态是区分内科、传染病和寄生虫的重要依据',
      priority: 2,
    })
  }

  if (categoryPath.includes('寄生虫病')) {
    questions.push({
      field: 'parasite_risk',
      question: '最近一次体内驱虫是什么时候？粪便里有没有虫体、米粒样节片，或者长期消瘦/被毛粗糙？',
      guidance: '用于判断寄生虫性腹泻',
      priority: 3,
    })
  }

  if (categoryPath.includes('妇科/产科') && pet?.gender === 'female') {
    questions.push({
      field: 'reproductive_scope',
      question: `${femaleLabel}是否未绝育？最近是否发情、交配、怀孕、产后，或有阴道分泌物/腹部胀痛？`,
      guidance: '雌性未绝育动物需纳入生殖系统急症筛查',
      priority: 3,
    })
  }

  const rankedQuestions = selectNextQuestions({
    rankedCandidates: candidates.map((candidate) => candidate.ranking),
    askedQuestions: questions.map((question) => question.question),
    confirmedSymptoms: [],
    deniedSymptoms: [],
    maxQuestions: 3,
  })
  questions.push(...rankedQuestions.map(({ field, question, guidance, priority }) => ({
    field,
    question,
    guidance,
    priority,
  })))

  for (const candidate of candidates.slice(0, 4)) {
    const keyQuestion = firstUnaskedKeyQuestion(candidate.entry, rawText)
    if (keyQuestion) questions.push(keyQuestion)
  }

  return dedupeQuestions(questions).slice(0, 4)
}

function firstUnaskedKeyQuestion(entry: KnowledgeEntry, rawText: string): FollowUpQuestion | null {
  const keySymptom = (entry.key_symptoms || [])
    .filter((symptom) => symptom.weight === 'core' || symptom.weight === 'major')
    .find((symptom) => !symptomMatches(symptom.term, rawText, []))

  if (!keySymptom) return null
  return {
    field: `key_${entry.id}_${keySymptom.term}`,
    question: keySymptom.ask,
    guidance: `用于判断是否支持${entry.disease}`,
    priority: keySymptom.weight === 'core' ? 1 : 2,
  }
}

function shouldRequireFollowup(
  candidates: RoutedCandidate[],
  rawText: string,
  config: ConsultationConfig = getConsultationConfig()
): boolean {
  if (candidates.length === 0) return true
  const top = candidates[0]
  const second = candidates[1]
  const hasDecisiveText = /番茄|血便|黑便|腥臭|无尿|尿不出|抽搐|呼吸困难|休克|虚脱|发绀|腹部.*急剧/.test(rawText)

  if (top.score >= config.convergence.highConfidenceScore && hasDecisiveText) return false
  if (!second) return top.score < config.convergence.singleCandidateScore
  if (top.score < config.convergence.highConfidenceScore) return true
  return top.score - second.score < config.convergence.clearLeadGap
}

function buildEntryTerms(entry: KnowledgeEntry): string[] {
  return [
    entry.disease,
    entry.category,
    ...(entry.category_path || []),
    ...(entry.entry_symptoms || []),
    ...entry.symptoms.primary,
    ...entry.symptoms.secondary,
  ]
}

function buildText(symptoms: string[], rawText: string): string {
  return `${rawText} ${symptoms.join(' ')}`.toLowerCase()
}

function dedupeQuestions(questions: FollowUpQuestion[]): FollowUpQuestion[] {
  const seen = new Set<string>()
  return questions
    .filter((question) => {
      if (seen.has(question.question)) return false
      seen.add(question.question)
      return true
    })
}
