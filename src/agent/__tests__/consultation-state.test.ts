import { describe, expect, it } from 'vitest'
import { runPipeline } from '../pipeline'
import { SessionState } from '../types'
import {
  createInitialConsultationState,
  mergeConsultationEvidence,
  updateConsultationRouting,
} from '../consultation-state'
import { clearStore, createProfile } from '@/store/profile'
import { clearRateLimits, clearSessions, createSession, transition } from '@/store/session'

describe('ConsultationState', () => {
  it('adds a confirmed symptom once across turns', () => {
    const state = createInitialConsultationState({
      sessionId: 'ses-1',
      petId: 'pet-1',
      species: '犬',
    })

    const first = mergeConsultationEvidence(state, {
      species: '犬',
      rawText: '狗吐了',
      confirmedSymptoms: ['呕吐'],
      deniedSymptoms: [],
      unknownSymptoms: [],
    })
    const second = mergeConsultationEvidence(first, {
      species: '犬',
      rawText: '还是呕吐',
      confirmedSymptoms: ['呕吐'],
      deniedSymptoms: [],
      unknownSymptoms: [],
    })

    expect(second.confirmedSymptoms).toEqual(['呕吐'])
    expect(second.rawTurns).toEqual(['狗吐了', '还是呕吐'])
  })

  it('moves a previously confirmed symptom to denied when latest turn clearly denies it', () => {
    const state = createInitialConsultationState({
      sessionId: 'ses-1',
      petId: 'pet-1',
      species: '猫',
    })
    const first = mergeConsultationEvidence(state, {
      species: '猫',
      rawText: '猫有呕吐',
      confirmedSymptoms: ['呕吐'],
      deniedSymptoms: [],
      unknownSymptoms: [],
    })

    const second = mergeConsultationEvidence(first, {
      species: '猫',
      rawText: '现在没有呕吐',
      confirmedSymptoms: [],
      deniedSymptoms: ['呕吐'],
      unknownSymptoms: [],
    })

    expect(second.confirmedSymptoms).not.toContain('呕吐')
    expect(second.deniedSymptoms).toEqual(['呕吐'])
  })

  it('rejects evidence from a different species inside an active consultation', () => {
    const state = createInitialConsultationState({
      sessionId: 'ses-1',
      petId: 'pet-1',
      species: '犬',
    })

    expect(() => mergeConsultationEvidence(state, {
      species: '猫',
      rawText: '猫尿不出来',
      confirmedSymptoms: ['排尿困难'],
      deniedSymptoms: [],
      unknownSymptoms: [],
    })).toThrow(/species|物种|犬|猫/)
  })

  it('stores category routing, candidates, questions, and decision trace', () => {
    const state = createInitialConsultationState({
      sessionId: 'ses-1',
      petId: 'pet-1',
      species: '犬',
    })

    const routed = updateConsultationRouting(state, {
      activeCategories: ['传染病', '消化系统', '寄生虫病'],
      candidatePool: [{
        disease: '犬细小病毒病',
        score: 92,
        reason: '命中症状: 血便、呕吐',
        matchedCore: ['血便'],
        matchedSecondary: ['呕吐'],
        matchedRisks: ['疫苗未完成'],
        deniedCore: [],
        missingCore: ['白细胞下降'],
      }],
      pendingQuestions: [{
        field: 'infectious_gi_signs',
        question: '有没有发热、反复呕吐、血便/黑便或特别腥臭的腹泻？',
        guidance: '用于区分细小、冠状、细菌性肠炎和寄生虫',
        priority: 1,
      }],
      roundsUsed: 1,
      decisionTrace: [{
        node: 'candidate_router',
        decision: 'ask_followup',
        reason: '候选未收敛',
        at: 1,
      }],
    })

    expect(routed.activeCategories).toEqual(['传染病', '消化系统', '寄生虫病'])
    expect(routed.screenedCategories).toEqual(['传染病', '消化系统', '寄生虫病'])
    expect(routed.candidatePool[0].disease).toBe('犬细小病毒病')
    expect(routed.pendingQuestions[0].field).toBe('infectious_gi_signs')
    expect(routed.roundsUsed).toBe(1)
    expect(routed.decisionTrace[0].node).toBe('candidate_router')
  })

  it('is persisted by the consultation pipeline across turns', async () => {
    clearStore()
    clearSessions()
    clearRateLimits()
    process.env.LLM_MOCK = 'true'
    const pet = createProfile({
      species: '猫',
      breed: '中华田园猫',
      age: 2,
      weight: 4,
      gender: 'male',
      neutered: true,
      vaccination: '已完成基础免疫',
      medicalHistory: '无',
      allergies: '无',
      chronicConditions: '无',
    })
    const session = createSession(pet.id)
    transition(session, SessionState.COLLECTING)

    const first = await runPipeline(session, '猫拉稀，不呕吐，精神很好')
    const second = await runPipeline(first.session, '还是拉稀，但是没有发烧')
    const state = second.session.context.consultationState

    expect(state?.species).toBe('猫')
    expect(state?.rawTurns).toEqual(['猫拉稀，不呕吐，精神很好', '还是拉稀，但是没有发烧'])
    expect(state?.confirmedSymptoms).toContain('腹泻')
    expect(state?.deniedSymptoms).toEqual(expect.arrayContaining(['呕吐', '发热']))
    expect(state?.activeCategories.length).toBeGreaterThan(0)
    expect(state?.candidatePool.length).toBeGreaterThan(0)
  })
})
