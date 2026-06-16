import { describe, expect, it } from 'vitest'
import { rankCandidates, rankSingleCandidate } from '../candidate-ranker'
import { loadAllKnowledge } from '@/knowledge/loader'

describe('candidate ranker', () => {
  it('ranks decisive parvovirus evidence above generic digestive disease', () => {
    const entries = loadAllKnowledge('犬')
    const selected = entries.filter((entry) =>
      ['canine-inf-001', 'canine-dig-003'].includes(entry.id)
    )

    const ranked = rankCandidates({
      species: '犬',
      entries: selected,
      symptoms: ['腹泻', '呕吐', '发热', '排便带血', '精神萎靡'],
      rawText: '幼犬没打完疫苗，前几天接触过别的狗，现在发热，反复呕吐，拉番茄酱样血便，味道特别腥臭，精神很差',
      categoryPath: ['消化系统', '传染病', '寄生虫病'],
    })

    expect(ranked[0].entry.id).toBe('canine-inf-001')
    expect(ranked[0].score).toBeGreaterThanOrEqual(85)
    expect(ranked[0].matchedCore.length).toBeGreaterThan(0)
    expect(ranked[0].matchedRisks.length).toBeGreaterThan(0)
    expect(ranked[0].trace).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/命中|风险因素|疾病特异/),
      ])
    )
  })

  it('applies strong counter-evidence when core disease signs are explicitly denied', () => {
    const parvo = loadAllKnowledge('犬').find((entry) => entry.id === 'canine-inf-001')
    expect(parvo).toBeDefined()

    const ranked = rankSingleCandidate({
      entry: parvo!,
      symptoms: ['腹泻'],
      rawText: '成年犬拉肚子，没有发烧，没有血便，也没有腥臭味，疫苗已经打完',
      categoryPath: ['消化系统', '传染病'],
    })

    expect(ranked.deniedCore.length).toBeGreaterThanOrEqual(2)
    expect(ranked.coherence.counterEvidencePenalty).toBeGreaterThanOrEqual(20)
    expect(ranked.score).toBeLessThan(70)
    expect(ranked.trace.join('\n')).toMatch(/反证|缺失|降权/)
  })

  it('heavily lowers unrelated candidates for a digestive chief complaint', () => {
    const dermatology = loadAllKnowledge('犬').find((entry) => entry.category === '皮肤科')
    expect(dermatology).toBeDefined()

    const ranked = rankSingleCandidate({
      entry: dermatology!,
      symptoms: ['腹泻', '呕吐'],
      rawText: '狗拉肚子还吐，没有皮肤瘙痒，也没有掉毛',
      categoryPath: ['消化系统', '传染病', '寄生虫病'],
    })

    expect(ranked.score).toBeLessThan(35)
    expect(ranked.matchedCore).toHaveLength(0)
    expect(ranked.deniedCore.length + ranked.deniedSecondary.length).toBeGreaterThan(0)
    expect(ranked.trace.join('\n')).toMatch(/不相关|反证|降权/)
  })
})
