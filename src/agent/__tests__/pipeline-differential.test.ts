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

describe('Pipeline differential convergence', () => {
  it('should carry a locked differential candidate into the uncertainty range instead of a low-confidence diagnosis', async () => {
    const pet = createProfile({
      species: '犬',
      breed: '贵宾',
      age: 5,
      weight: 7,
      gender: 'male',
      neutered: true,
      vaccination: '已完成基础免疫',
      medicalHistory: '无',
      allergies: '无',
      chronicConditions: '无',
    })
    const session = createSession(pet.id)
    transition(session, SessionState.COLLECTING)

    const first = await runPipeline(
      session,
      '狗从昨天开始呕吐，腹痛，弓背姿势，食欲下降'
    )

    expect(first.output.interview?.isComplete).toBe(false)
    expect(first.output.interview?.questions.map(q => q.question).join('\n')).toMatch(/剧烈腹痛|食欲废绝|高脂肪|弓背/)

    const second = await runPipeline(
      first.session,
      '有，弓背姿势很明显，肚子疼得厉害，昨天吃了肥肉，完全不吃'
    )

    const diagnosisSection = second.output.report?.sections.find(section => section.type === 'diagnosis')
    const rangeSection = second.output.report?.sections.find(section => section.title.includes('待排查范围'))
    expect(second.output.report).toBeDefined()
    expect(diagnosisSection).toBeUndefined()
    expect(rangeSection?.content).toContain('胰腺炎')
    expect(rangeSection?.content).toMatch(/cPLI|超声|血液/)
  })
})
