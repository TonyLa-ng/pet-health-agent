import { describe, expect, it } from 'vitest'
import { runConsultationGraph } from '../consultation-graph'
import { createInitialConsultationState } from '../consultation-state'
import type { PetProfile, Session } from '@/store/types'
import { SessionState } from '../types'

function makePet(overrides: Partial<PetProfile> = {}): PetProfile {
  return {
    id: 'pet-1',
    species: '犬',
    breed: '混血',
    age: 2,
    weight: 8,
    gender: 'male',
    neutered: true,
    vaccination: '未知',
    medicalHistory: '无',
    allergies: '无',
    chronicConditions: '无',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function makeSession(petId = 'pet-1'): Session {
  return {
    id: 'session-1',
    petId,
    state: SessionState.COLLECTING,
    createdAt: 1,
    lastActivityAt: 1,
    expiresAt: 999,
    lockAcquiredAt: null,
    history: [],
    violationCount: 0,
    context: {
      mandatoryFieldsCompleted: [],
      mandatoryFieldsMissing: [],
      uncollectableFields: [],
      fieldDataValidity: {},
    },
  }
}

describe('consultation graph runner', () => {
  it('runs fixed nodes and asks category-aware follow-up for dog diarrhea', async () => {
    const pet = makePet()
    const state = createInitialConsultationState({
      sessionId: 'session-1',
      petId: pet.id,
      species: '犬',
    })

    const result = await runConsultationGraph({
      session: makeSession(pet.id),
      pet,
      latestUserText: '我家狗拉肚子',
      state,
    })

    expect(result.blocked).toBe(false)
    expect(result.state.activeCategories).toEqual(expect.arrayContaining(['内科', '传染病', '寄生虫病']))
    expect(result.state.candidatePool.length).toBeGreaterThan(0)
    expect(result.interview?.questions.map((question) => question.field)).toEqual(
      expect.arrayContaining(['infectious_risk', 'diet_toxin_foreign_body'])
    )
    expect(result.decisionTrace.map((item) => item.node)).toEqual(
      expect.arrayContaining(['species_guard', 'input_guard', 'normalize', 'triage', 'category', 'retrieve', 'rank', 'question_select', 'converge'])
    )
  })

  it('blocks cross-species text before dog/cat routing can mix', async () => {
    const pet = makePet({ species: '猫' })

    const result = await runConsultationGraph({
      session: makeSession(pet.id),
      pet,
      latestUserText: '我家狗拉稀了',
    })

    expect(result.blocked).toBe(true)
    expect(result.interview?.questions[0].field).toBe('species_switch')
    expect(result.state.candidatePool).toHaveLength(0)
    expect(result.decisionTrace.map((item) => item.node)).toContain('species_guard')
  })
})
