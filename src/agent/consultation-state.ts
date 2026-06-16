export type ConsultationSpecies = '犬' | '猫'

export interface RankedDiseaseCandidate {
  disease: string
  score: number
  reason: string
  matchedCore: string[]
  matchedSecondary: string[]
  matchedRisks: string[]
  deniedCore: string[]
  missingCore: string[]
}

export interface PendingQuestion {
  field: string
  question: string
  guidance: string
  priority: number
  symptom?: string
}

export interface DecisionTraceItem {
  node: string
  decision: string
  reason: string
  at: number
}

export interface ConsultationState {
  sessionId: string
  petId: string
  species: ConsultationSpecies
  rawTurns: string[]
  confirmedSymptoms: string[]
  deniedSymptoms: string[]
  unknownSymptoms: string[]
  activeCategories: string[]
  screenedCategories: string[]
  candidatePool: RankedDiseaseCandidate[]
  pendingQuestions: PendingQuestion[]
  roundsUsed: number
  maxRounds: number
  decisionTrace: DecisionTraceItem[]
}

export interface CreateConsultationStateInput {
  sessionId: string
  petId: string
  species: ConsultationSpecies
  maxRounds?: number
}

export interface ConsultationEvidence {
  species: ConsultationSpecies
  rawText: string
  confirmedSymptoms: string[]
  deniedSymptoms: string[]
  unknownSymptoms: string[]
}

export interface ConsultationRoutingUpdate {
  activeCategories: string[]
  screenedCategories?: string[]
  candidatePool: RankedDiseaseCandidate[]
  pendingQuestions: PendingQuestion[]
  roundsUsed?: number
  decisionTrace?: DecisionTraceItem[]
}

export function createInitialConsultationState(input: CreateConsultationStateInput): ConsultationState {
  return {
    sessionId: input.sessionId,
    petId: input.petId,
    species: input.species,
    rawTurns: [],
    confirmedSymptoms: [],
    deniedSymptoms: [],
    unknownSymptoms: [],
    activeCategories: [],
    screenedCategories: [],
    candidatePool: [],
    pendingQuestions: [],
    roundsUsed: 0,
    maxRounds: input.maxRounds ?? 3,
    decisionTrace: [],
  }
}

export function mergeConsultationEvidence(
  state: ConsultationState,
  evidence: ConsultationEvidence
): ConsultationState {
  if (state.species !== evidence.species) {
    throw new Error(`Consultation species mismatch: active=${state.species}, incoming=${evidence.species}`)
  }

  const denied = new Set(state.deniedSymptoms)
  const confirmed = new Set(state.confirmedSymptoms)
  const unknown = new Set(state.unknownSymptoms)

  for (const symptom of evidence.confirmedSymptoms) {
    if (!symptom) continue
    denied.delete(symptom)
    unknown.delete(symptom)
    confirmed.add(symptom)
  }

  for (const symptom of evidence.deniedSymptoms) {
    if (!symptom) continue
    confirmed.delete(symptom)
    unknown.delete(symptom)
    denied.add(symptom)
  }

  for (const symptom of evidence.unknownSymptoms) {
    if (!symptom || confirmed.has(symptom) || denied.has(symptom)) continue
    unknown.add(symptom)
  }

  return {
    ...state,
    rawTurns: [...state.rawTurns, evidence.rawText].filter(Boolean).slice(-12),
    confirmedSymptoms: Array.from(confirmed),
    deniedSymptoms: Array.from(denied),
    unknownSymptoms: Array.from(unknown),
  }
}

export function updateConsultationRouting(
  state: ConsultationState,
  update: ConsultationRoutingUpdate
): ConsultationState {
  return {
    ...state,
    activeCategories: unique(update.activeCategories),
    screenedCategories: unique([
      ...state.screenedCategories,
      ...(update.screenedCategories || update.activeCategories),
    ]),
    candidatePool: update.candidatePool.slice(0, 12),
    pendingQuestions: update.pendingQuestions.slice(0, 8),
    roundsUsed: update.roundsUsed ?? state.roundsUsed,
    decisionTrace: [
      ...state.decisionTrace,
      ...(update.decisionTrace || []),
    ].slice(-30),
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}
