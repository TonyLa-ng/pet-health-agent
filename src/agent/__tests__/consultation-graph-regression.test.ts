import { beforeEach, describe, expect, it } from 'vitest'
import { runPipeline } from '../pipeline'
import { SessionState } from '../types'
import { clearStore, createProfile } from '@/store/profile'
import { clearRateLimits, clearSessions, createSession, transition } from '@/store/session'

beforeEach(() => {
  clearStore()
  clearSessions()
  clearRateLimits()
  process.env.LLM_MOCK = 'true'
})

function makeDog(overrides: Partial<Parameters<typeof createProfile>[0]> = {}) {
  return createProfile({
    species: '犬',
    breed: '混血',
    age: 2,
    weight: 8,
    gender: 'male',
    neutered: true,
    vaccination: '已完成基础免疫',
    medicalHistory: '无',
    allergies: '无',
    chronicConditions: '无',
    ...overrides,
  })
}

function makeCat(overrides: Partial<Parameters<typeof createProfile>[0]> = {}) {
  return createProfile({
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
    ...overrides,
  })
}

function startSession(petId: string) {
  const session = createSession(petId)
  transition(session, SessionState.COLLECTING)
  return session
}

function sectionText(result: Awaited<ReturnType<typeof runPipeline>>): string {
  return result.output.report?.sections.map((section) => `${section.title}\n${section.content}`).join('\n\n') || ''
}

describe('Rule-driven consultation acceptance cases', () => {
  it('directly triggers emergency for dog eating rat poison with seizures', async () => {
    const pet = makeDog()
    const result = await runPipeline(startSession(pet.id), '我家狗吃了老鼠药，现在抽搐、站不稳、流口水')

    const text = sectionText(result)

    expect(result.output.triage.level).toBe('critical')
    expect(result.session.state).toBe(SessionState.EMERGENCY_TRIGGERED)
    expect(text).toMatch(/紧急|立即|急诊|宠物医院/)
    expect(result.output.interview?.questions.length || 0).toBe(0)
  })

  it('directly returns high-confidence CPV for unvaccinated puppy with tomato foul bloody diarrhea', async () => {
    const pet = makeDog({
      age: 0.25,
      vaccination: '未免疫',
      neutered: false,
    })

    const result = await runPipeline(
      startSession(pet.id),
      '三个月幼犬未免疫，反复呕吐，拉番茄酱样腥臭味血便，精神沉郁，喝水也吐'
    )
    const text = sectionText(result)

    expect(text).toContain('犬细小病毒感染')
    expect(text).toMatch(/置信度：(9\d|100)%/)
    expect(result.output.interview?.questions.length || 0).toBe(0)
  })

  it('downranks vomiting-core diseases when cat diarrhea explicitly denies vomiting and depression', async () => {
    const pet = makeCat()

    const first = await runPipeline(
      startSession(pet.id),
      '猫拉稀，但是不呕吐，精神很好，食欲也正常，没有发烧'
    )
    const firstQuestions = first.output.interview?.questions.map((question) => question.question).join('\n') || ''

    expect(first.output.report).toBeUndefined()
    expect(firstQuestions).toMatch(/驱虫|虫体|粪便|水样|黏液/)
    expect(firstQuestions).not.toMatch(/反复呕吐.*血便.*猫瘟/)
  })

  it('backtracks from digestive category to parasite category when digestive candidates are ruled out', async () => {
    const pet = makeCat({
      vaccination: '已完成基础免疫',
    })
    const session = startSession(pet.id)

    const first = await runPipeline(session, '猫拉稀，最近瘦了，被毛粗糙')
    const second = await runPipeline(
      first.session,
      '没有呕吐，没有发烧，没有血便，没吃乱七八糟的东西，但是很久没驱虫，粪便里像有米粒节片'
    )
    const text = sectionText(second)
    const questions = second.output.interview?.questions.map((question) => question.question).join('\n') || ''

    expect(`${text}\n${questions}`).toMatch(/寄生虫|绦虫|蛔虫|驱虫|虫体/)
    expect(text).not.toMatch(/猫瘟.*高置信|猫瘟.*置信度：(8\d|9\d|100)%/)
  })

  it('returns a small disease range and hospital tests when only lab tests can distinguish candidates', async () => {
    const pet = makeDog({
      age: 5,
      breed: '贵宾',
      weight: 7,
    })
    const session = startSession(pet.id)

    const first = await runPipeline(
      session,
      '狗从昨天开始呕吐，腹痛，弓背姿势，食欲下降'
    )
    const second = await runPipeline(
      first.session,
      '有，弓背姿势很明显，肚子疼得厉害，昨天吃了肥肉，完全不吃'
    )
    const text = sectionText(second)

    expect(second.output.report).toBeDefined()
    expect(text).toContain('待排查范围与建议检查')
    expect(text).toContain('胰腺炎')
    expect(text).toMatch(/cPLI|超声|血液|生化/)
    expect(text).not.toMatch(/初步判断（按可能性排序）[\s\S]*置信度：[0-5]\d%/)
  })
})
