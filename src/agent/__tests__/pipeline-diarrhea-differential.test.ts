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

describe('Pipeline diarrhea differential routing', () => {
  it('asks category-level differential questions instead of locking dog diarrhea to gastritis', async () => {
    const pet = createProfile({
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
    })
    const session = createSession(pet.id)
    transition(session, SessionState.COLLECTING)

    const first = await runPipeline(session, '狗拉肚子')
    const questions = first.output.interview?.questions.map((question) => question.question).join('\n') || ''
    const fields = first.output.interview?.questions.map((question) => question.field) || []

    expect(first.output.interview?.isComplete).toBe(false)
    expect(fields).toEqual([
      'infectious_risk',
      'infectious_gi_signs',
      'diet_toxin_foreign_body',
      'stool_shape',
    ])
    expect(questions).toMatch(/疫苗|接触|发热|血便|腥臭|吃.*东西|中毒|精神/)
    expect(first.output.report).toBeUndefined()
  })

  it('prioritizes infectious disease after animal exposure and locks parvovirus when decisive signs appear', async () => {
    const pet = createProfile({
      species: '犬',
      breed: '边牧',
      age: 0.25,
      weight: 5,
      gender: 'male',
      neutered: false,
      vaccination: '未完成',
      medicalHistory: '无',
      allergies: '无',
      chronicConditions: '无',
    })
    const session = createSession(pet.id)
    transition(session, SessionState.COLLECTING)

    const first = await runPipeline(session, '狗拉肚子')
    const second = await runPipeline(first.session, '前几天跟别的动物玩过，还没打完疫苗')
    const secondQuestions = second.output.interview?.questions.map((question) => question.question).join('\n') || ''

    expect(second.output.interview?.isComplete).toBe(false)
    expect(secondQuestions).toMatch(/发热|呕吐|血便|腥臭|脱水|精神/)

    const third = await runPipeline(
      second.session,
      '有发烧，吐了好几次，拉番茄酱样血便，味道特别腥臭，精神很差'
    )

    const diagnosis = third.output.report?.sections.find((section) => section.type === 'diagnosis')
    const emergency = third.output.report?.sections.find((section) => section.type === 'emergency_signs')
    const diff = third.output.report?.sections.find((section) => section.type === 'differential')

    expect(third.output.report).toBeDefined()
    expect(diagnosis?.content).toContain('犬细小病毒感染')
    expect(emergency?.content).toMatch(/立即|急诊|宠物医院/)
    expect(diff?.content).toMatch(/CPV|PCR|血常规|电解质/)
  })

  it('does not escalate negated blood stool, fever, or vomiting as critical signs', async () => {
    const pet = createProfile({
      species: '犬',
      breed: '边牧',
      age: 1,
      weight: 10,
      gender: 'male',
      neutered: false,
      vaccination: '未完成',
      medicalHistory: '无',
      allergies: '无',
      chronicConditions: '无',
    })
    const session = createSession(pet.id)
    transition(session, SessionState.COLLECTING)

    const first = await runPipeline(session, '狗拉肚子')
    const second = await runPipeline(
      first.session,
      '前几天跟别的动物玩过，还没打完疫苗，现在精神不好，水样便，暂时没有血便，也没有发热，没有呕吐'
    )

    const summary = second.output.report?.sections.map((section) => section.content).join('\n') || ''

    expect(second.output.triage.level).not.toBe('critical')
    expect(second.session.state).not.toBe(SessionState.EMERGENCY_TRIGGERED)
    expect(summary).not.toContain('排便带血')
  })

  it('locks parvovirus from decisive CPV signs despite a default completed-vaccine profile', async () => {
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

    const first = await runPipeline(session, '狗拉肚子')
    const second = await runPipeline(
      first.session,
      '前几天跟别的动物玩过，还没打完疫苗，现在精神不好，水样便，暂时没有血便，也没有发热，没有呕吐'
    )
    const third = await runPipeline(
      second.session,
      '现在开始发热，吐了好几次，拉番茄酱样血便，味道特别腥臭，精神很差，喝水也吐'
    )

    const diagnosis = third.output.report?.sections.find((section) => section.type === 'diagnosis')

    expect(third.output.report).toBeDefined()
    expect(diagnosis?.content).toContain('犬细小病毒感染')
  })
})
