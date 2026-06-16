import { describe, expect, it } from 'vitest'
import { buildCandidatePool, scoreCandidateCoherence } from '../differential-router'
import { loadAllKnowledge } from '@/knowledge/loader'

describe('Disease category routing and evidence coherence', () => {
  it('routes a dog diarrhea chief complaint into digestive, infectious, parasitic, and toxin buckets instead of locking gastritis', () => {
    const entries = loadAllKnowledge('犬')
    const pool = buildCandidatePool({
      species: '犬',
      symptoms: ['腹泻'],
      rawText: '我家狗拉肚子',
      pet: { gender: 'male', vaccination: '未知', age: 2 },
      entries,
    })

    expect(pool.requiresFollowup).toBe(true)
    expect(pool.nextQuestions.map((question) => question.field)).toEqual([
      'infectious_risk',
      'infectious_gi_signs',
      'diet_toxin_foreign_body',
      'stool_shape',
    ])
    expect(pool.categoryPath).toEqual(expect.arrayContaining(['内科', '传染病', '寄生虫病', '中毒']))
    expect(pool.candidates.some((candidate) => candidate.entry.category === '消化系统')).toBe(true)
    expect(pool.candidates.some((candidate) => candidate.entry.category === '传染病')).toBe(true)
    expect(pool.candidates.some((candidate) => candidate.entry.category === '寄生虫')).toBe(true)

    const topNames = pool.candidates.slice(0, 3).map((candidate) => candidate.entry.disease)
    expect(topNames).not.toEqual(['急性胃炎'])
  })

  it('adds reproductive scope for compatible female pet complaints', () => {
    const entries = loadAllKnowledge('犬')
    const pool = buildCandidatePool({
      species: '犬',
      symptoms: ['腹泻', '精神萎靡'],
      rawText: '未绝育母犬腹泻没精神',
      pet: { gender: 'female', neutered: false, vaccination: '未知', age: 4 },
      entries,
    })

    expect(pool.categoryPath).toContain('妇科/产科')
    expect(pool.candidates.some((candidate) => candidate.entry.category === '产科')).toBe(true)
  })

  it('strongly penalizes candidates whose disease pattern cannot explain the user symptoms', () => {
    const entries = loadAllKnowledge('犬')
    const dermatology = entries.find((entry) => entry.category === '皮肤科')
    const infectious = entries.find((entry) => entry.id === 'canine-inf-001')

    expect(dermatology).toBeDefined()
    expect(infectious).toBeDefined()

    const skinScore = scoreCandidateCoherence({
      entry: dermatology!,
      symptoms: ['腹泻', '呕吐'],
      rawText: '狗拉肚子还吐',
      categoryPath: ['消化系统', '传染病', '寄生虫病'],
    })
    const parvoScore = scoreCandidateCoherence({
      entry: infectious!,
      symptoms: ['腹泻', '呕吐'],
      rawText: '狗拉肚子还吐',
      categoryPath: ['消化系统', '传染病', '寄生虫病'],
    })

    expect(skinScore.counterEvidencePenalty).toBeGreaterThanOrEqual(35)
    expect(skinScore.score).toBeLessThan(parvoScore.score)
    expect(skinScore.score).toBeLessThan(35)
  })

  it('promotes infectious follow-up after recent contact with other animals', () => {
    const entries = loadAllKnowledge('犬')
    const pool = buildCandidatePool({
      species: '犬',
      symptoms: ['腹泻'],
      rawText: '前几天跟别的动物玩过，现在拉肚子',
      pet: { gender: 'male', vaccination: '未完成', age: 0.3 },
      entries,
    })

    expect(pool.nextQuestions.map((question) => question.question).join('\n')).toMatch(/疫苗|接触|发热|血便|腥臭|呕吐|精神/)
    expect(pool.candidates[0].entry.category).toBe('传染病')
  })

  it('lowers parvovirus when key parvo signs are explicitly absent', () => {
    const entries = loadAllKnowledge('犬')
    const pool = buildCandidatePool({
      species: '犬',
      symptoms: ['腹泻'],
      rawText: '成年犬拉肚子，没有发烧，没有血便，也没有腥臭味，昨天吃了剩饭',
      pet: { gender: 'male', vaccination: '已完成基础免疫', age: 6 },
      entries,
    })

    const parvo = pool.candidates.find((candidate) => candidate.entry.id === 'canine-inf-001')
    const enteritis = pool.candidates.find((candidate) => candidate.entry.id === 'canine-dig-003')

    expect(parvo).toBeDefined()
    expect(enteritis).toBeDefined()
    expect(parvo!.coherence.counterEvidencePenalty).toBeGreaterThanOrEqual(20)
    expect(parvo!.score).toBeLessThan(enteritis!.score)
  })

  it('promotes parvovirus for decisive bloody foul diarrhea and repeated vomiting even in a default adult profile', () => {
    const entries = loadAllKnowledge('犬')
    const pool = buildCandidatePool({
      species: '犬',
      symptoms: ['腹泻', '精神萎靡', '排便带血', '呕吐', '发热'],
      rawText: '前几天跟别的动物玩过，还没打完疫苗，现在发热，吐了好几次，拉番茄酱样血便，味道特别腥臭，精神很差，喝水也吐',
      pet: { gender: 'male', vaccination: '已完成基础免疫', age: 3 },
      entries,
    })

    expect(pool.candidates[0].entry.id).toBe('canine-inf-001')
    expect(pool.candidates[0].score).toBeGreaterThanOrEqual(85)
  })
})
