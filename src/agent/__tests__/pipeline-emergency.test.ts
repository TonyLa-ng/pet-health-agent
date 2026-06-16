import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runPipeline } from '../pipeline'
import { createProfile, clearStore } from '@/store/profile'
import { createSession, clearRateLimits, clearSessions, transition } from '@/store/session'
import { SessionState } from '../types'

vi.mock('@/knowledge/keyword-transformer', () => ({
  transformKeywords: vi.fn(async (text: string) => {
    if (text.includes('尿')) {
      return { coreSymptoms: ['排尿困难', '尿频'], confidence: 0.9 }
    }
    if (text.includes('洋葱')) {
      return { coreSymptoms: ['中毒', '精神萎靡', '牙龈苍白'], confidence: 0.9 }
    }
    return { coreSymptoms: [], confidence: 0.5 }
  }),
  mergeKeywords: vi.fn((llmResult: { coreSymptoms: string[] }, ruleSymptoms: string[]) => [
    ...new Set([...llmResult.coreSymptoms, ...ruleSymptoms]),
  ]),
}))

beforeEach(() => {
  clearStore()
  clearSessions()
  clearRateLimits()
  process.env.LLM_MOCK = 'true'
})

describe('Pipeline emergency handling', () => {
  it('should not ask follow-up questions before warning on critical cat urinary blockage', async () => {
    const pet = createProfile({
      species: '猫',
      breed: '英短',
      age: 3,
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

    const { output, session: updatedSession } = await runPipeline(
      session,
      '公猫频繁进猫砂盆蹲很久，尿不出来，一直叫，精神差'
    )

    expect(output.triage.level).toBe('critical')
    expect(output.report).toBeDefined()
    expect(output.interview?.isComplete).toBe(true)
    expect(updatedSession.state).toBe(SessionState.EMERGENCY_TRIGGERED)
  })

  it('should provide a report instead of a compliance error for safety-seeking onion exposure', async () => {
    const pet = createProfile({
      species: '犬',
      breed: '金毛',
      age: 3,
      weight: 25,
      gender: 'male',
      neutered: true,
      vaccination: '已完成基础免疫',
      medicalHistory: '无',
      allergies: '无',
      chronicConditions: '无',
    })
    const session = createSession(pet.id)
    transition(session, SessionState.COLLECTING)

    const { output, session: updatedSession } = await runPipeline(
      session,
      '狗吃了洋葱后精神差，牙龈苍白，我该怎么办'
    )

    expect(output.sseEvents.some((event) => event.section === 'error')).toBe(false)
    expect(output.triage.level).toBe('critical')
    expect(output.report).toBeDefined()
    expect(updatedSession.state).toBe(SessionState.EMERGENCY_TRIGGERED)
  })
})
