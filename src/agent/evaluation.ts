import { detectTriage } from './triage'
import { buildCandidatePool } from './differential-router'
import { normalize } from '@/knowledge/normalizer'
import { loadAllKnowledge } from '@/knowledge/loader'

export interface EvaluationCase {
  id: string
  species: '犬' | '猫'
  text: string
  targetDisease: string
  expectedCategory: string
  isEmergency: boolean
  expectedQuestionKeywords?: string[]
  allowedDiseaseRange?: string[]
}

export interface EvaluationCaseResult {
  id: string
  species: '犬' | '猫'
  targetDisease: string
  topCandidates: Array<{ disease: string; score: number; category: string }>
  top1Hit: boolean
  top3Hit: boolean
  emergencyExpected: boolean
  emergencyDetected: boolean
  crossSpeciesLeak: boolean
  askedQuestionCount: number
  expectedQuestionHit: boolean
}

export interface EvaluationReport {
  totalCases: number
  metrics: {
    top1Accuracy: number
    top3Recall: number
    emergencySensitivity: number
    lowConfidenceFormalDiagnosisRate: number
    averageFollowupRounds: number
    averageAskedQuestions: number
    crossSpeciesLeaks: number
  }
  caseResults: EvaluationCaseResult[]
}

export function evaluateConsultationCases(cases: EvaluationCase[]): EvaluationReport {
  const caseResults = cases.map(evaluateOneCase)
  const emergencyCases = caseResults.filter((result) => result.emergencyExpected)
  const lowConfidenceFormalDiagnoses = caseResults.filter((result) => {
    const top = result.topCandidates[0]
    return Boolean(top) && top.score < 65 && result.askedQuestionCount === 0
  })

  return {
    totalCases: caseResults.length,
    metrics: {
      top1Accuracy: ratio(caseResults.filter((result) => result.top1Hit).length, caseResults.length),
      top3Recall: ratio(caseResults.filter((result) => result.top3Hit).length, caseResults.length),
      emergencySensitivity: ratio(
        emergencyCases.filter((result) => result.emergencyDetected).length,
        emergencyCases.length
      ),
      lowConfidenceFormalDiagnosisRate: ratio(lowConfidenceFormalDiagnoses.length, caseResults.length),
      averageFollowupRounds: average(caseResults.map((result) => result.askedQuestionCount > 0 ? 1 : 0)),
      averageAskedQuestions: average(caseResults.map((result) => result.askedQuestionCount)),
      crossSpeciesLeaks: caseResults.filter((result) => result.crossSpeciesLeak).length,
    },
    caseResults,
  }
}

function evaluateOneCase(testCase: EvaluationCase): EvaluationCaseResult {
  const normalized = normalize(testCase.text, testCase.species)
  const symptoms = [
    ...normalized.chiefComplaint.map((symptom) => symptom.name),
    ...normalized.accompanyingSymptoms.map((symptom) => symptom.name),
  ]
  const entries = loadAllKnowledge(testCase.species)
  const pool = buildCandidatePool({
    species: testCase.species,
    symptoms,
    rawText: testCase.text,
    entries,
    maxCandidates: 10,
  })
  const triage = detectTriage(testCase.text, testCase.species, false)
  const topCandidates = pool.candidates.slice(0, 3).map((candidate) => ({
    disease: candidate.entry.disease,
    score: candidate.score,
    category: candidate.entry.category,
  }))
  const allowed = [testCase.targetDisease, ...(testCase.allowedDiseaseRange || [])]
  const top1Hit = topCandidates[0] ? diseaseMatches(topCandidates[0].disease, allowed) : false
  const top3Hit = topCandidates.some((candidate) => diseaseMatches(candidate.disease, allowed))
  const questionText = pool.nextQuestions.map((question) => question.question).join('\n')
  const expectedQuestionHit = (testCase.expectedQuestionKeywords || []).length === 0
    ? true
    : (testCase.expectedQuestionKeywords || []).some((keyword) => questionText.includes(keyword))

  return {
    id: testCase.id,
    species: testCase.species,
    targetDisease: testCase.targetDisease,
    topCandidates,
    top1Hit,
    top3Hit,
    emergencyExpected: testCase.isEmergency,
    emergencyDetected: triage.level === 'critical' || triage.level === 'urgent',
    crossSpeciesLeak: pool.candidates.some((candidate) => !candidate.entry.species.includes(testCase.species)),
    askedQuestionCount: pool.nextQuestions.length,
    expectedQuestionHit,
  }
}

function diseaseMatches(candidate: string, allowed: string[]): boolean {
  return allowed.some((target) =>
    candidate === target ||
    candidate.includes(target) ||
    target.includes(candidate)
  )
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return round(numerator / denominator)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
