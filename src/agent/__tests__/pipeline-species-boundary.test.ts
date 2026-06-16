import { beforeEach, describe, expect, it } from 'vitest'
import { runPipeline } from '../pipeline'
import { SessionState } from '../types'
import { createProfile, clearStore } from '@/store/profile'
import { clearRateLimits, clearSessions, createSession, transition } from '@/store/session'

beforeEach(() => {
  clearStore()
  clearSessions()
  clearRateLimits()
  process.env.LLM_MOCK = 'true'
})

describe('Pipeline species boundary', () => {
  it('should ask the user to switch when a dog is described in the cat module', async () => {
    const pet = createProfile({
      species: '猫',
      breed: '英短',
      age: 2,
      weight: 4,
      gender: 'female',
      neutered: true,
      vaccination: '已完成基础免疫',
      medicalHistory: '无',
      allergies: '无',
      chronicConditions: '无',
    })
    const session = createSession(pet.id)
    transition(session, SessionState.COLLECTING)

    const result = await runPipeline(session, '我家狗拉肚子，还吐了两次')
    const question = result.output.interview?.questions[0]

    expect(result.output.report).toBeUndefined()
    expect(question?.field).toBe('species_switch')
    expect(question?.question).toMatch(/当前.*猫.*犬|猫.*切换.*犬|犬.*切换/)
  })

  it('should ask the user to switch when a cat is described in the dog module', async () => {
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

    const result = await runPipeline(session, '猫一直进猫砂盆，但是尿不出来')
    const question = result.output.interview?.questions[0]

    expect(result.output.report).toBeUndefined()
    expect(question?.field).toBe('species_switch')
    expect(question?.question).toMatch(/当前.*犬.*猫|犬.*切换.*猫|猫.*切换/)
  })

  it('should keep cat diarrhea inside the cat differential path', async () => {
    const pet = createProfile({
      species: '猫',
      breed: '中华田园猫',
      age: 1,
      weight: 4,
      gender: 'female',
      neutered: false,
      vaccination: '未知',
      medicalHistory: '无',
      allergies: '无',
      chronicConditions: '无',
    })
    const session = createSession(pet.id)
    transition(session, SessionState.COLLECTING)

    const result = await runPipeline(session, '猫拉肚子')
    const questions = result.output.interview?.questions.map((item) => item.question).join('\n') || ''

    expect(result.output.interview?.isComplete).toBe(false)
    expect(questions).toMatch(/病猫|猫舍|猫瘟|猫冠状|猫传染病/)
    expect(questions).not.toMatch(/病犬|犬舍|犬细小/)
    expect(result.output.report).toBeUndefined()
  })
})
