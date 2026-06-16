import fs from 'fs'
import path from 'path'

export interface ConsultationConfig {
  categoryThreshold: number
  candidate: {
    categoryHit: number
    primarySymptomHit: number
    secondarySymptomHit: number
    coreKeySymptomHit: number
    majorKeySymptomHit: number
    minorKeySymptomHit: number
    riskCoreHit: number
    riskMajorHit: number
    riskMinorHit: number
    negativeCorePenalty: number
    negativePrimaryPenalty: number
    negativeSecondaryPenalty: number
    negativeOtherPenalty: number
    unrelatedPenalty: number
    sameCategoryUnrelatedPenalty: number
    genericUnrelatedPenalty: number
    urgentCategoryReserve: number
    candidateMinimumScore: number
    fallbackMinimumScore: number
    symptomCoverageCap: number
    keySymptomScoreCap: number
    riskFactorScoreCap: number
    counterEvidencePenaltyCap: number
    ruleOutCriticalPenalty: number
    ruleOutMajorPenalty: number
    ruleOutMinorPenalty: number
  }
  convergence: {
    highConfidenceScore: number
    minimumReportConfidence: number
    categoryBacktrackScore: number
    clearLeadGap: number
    testOnlyCandidateLimit: number
    singleCandidateScore: number
    postFollowupCandidateScore: number
  }
  interview: {
    trackedCandidateLimit: number
    maxQuestionsPerRound: number
    singleWinnerScore: number
    clearWinnerScore: number
    answeredWinnerScore: number
    strongEvidenceWinnerScore: number
    partialLeadGap: number
    closeCandidateScore: number
    closeCandidateGap: number
    relevantCandidateScore: number
    primarySymptomConfirmBoost: number
    strongSecondaryConfirmBoost: number
    secondaryConfirmBoost: number
    differentialConfirmBoost: number
    primaryDeniedPenalty: number
    secondaryDeniedPenalty: number
    differentialDeniedPenalty: number
  }
  rounds: {
    emergency: number
    commonMild: number
    complex: number
  }
}

const CONFIG_PATH = path.join(process.cwd(), 'data', 'consultation', 'config.json')

let cachedConfig: ConsultationConfig | null = null

export function getConsultationConfig(species: '犬' | '猫' | '兔' | '仓鼠' = '犬'): ConsultationConfig {
  void species
  if (!cachedConfig) {
    cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as ConsultationConfig
  }
  return structuredClone(cachedConfig)
}

export function clearConsultationConfigCache(): void {
  cachedConfig = null
}
