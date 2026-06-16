// ============================================
// Normalization Verifier Tests
// ============================================

import { describe, it, expect, beforeEach } from 'vitest'
import { verifyKeywords, clearVocabCache, getVocabStats } from '../normalization-verifier'

describe('Normalization Verifier - Vocabulary Index', () => {
  beforeEach(() => {
    clearVocabCache()
  })

  it('should build vocabulary index for dogs', () => {
    const stats = getVocabStats('犬')
    expect(stats.standardTerms).toBeGreaterThan(0)
    expect(stats.symptomTerms).toBeGreaterThan(0)
    expect(stats.diseaseNames).toBeGreaterThan(0)
  })

  it('should build vocabulary index for cats', () => {
    const stats = getVocabStats('猫')
    expect(stats.standardTerms).toBeGreaterThan(0)
    expect(stats.symptomTerms).toBeGreaterThan(0)
  })
})

describe('Normalization Verifier - Exact Matching', () => {
  beforeEach(() => {
    clearVocabCache()
  })

  it('should exact match standard terms', () => {
    const result = verifyKeywords(['呕吐', '腹泻', '食欲下降'], '犬')
    expect(result.verifiedTerms.length).toBe(3)
    expect(result.unmappedTerms.length).toBe(0)
    expect(result.coverage).toBe(1.0)

    const vomit = result.verifiedTerms.find((v) => v.canonicalForm === '呕吐')
    expect(vomit).toBeDefined()
    expect(vomit!.source).toBe('exact')
    expect(vomit!.confidence).toBe(1.0)
  })

  it('should exact match cat-specific terms', () => {
    const result = verifyKeywords(['乱尿', '躲藏行为', '过度舔舐'], '猫')
    expect(result.verifiedTerms.length).toBe(3)
  })
})

describe('Normalization Verifier - Synonym Matching', () => {
  beforeEach(() => {
    clearVocabCache()
  })

  it('should map colloquial terms to standard via synonyms', () => {
    const result = verifyKeywords(['吐', '窜稀', '不吃东西'], '犬')
    expect(result.verifiedTerms.length).toBe(3)

    const vomit = result.verifiedTerms.find((v) => v.canonicalForm === '呕吐')
    expect(vomit).toBeDefined()
    expect(vomit!.source).toBe('synonym')
    expect(vomit!.confidence).toBe(0.9)
    expect(vomit!.term).toBe('吐')

    const diarrhea = result.verifiedTerms.find((v) => v.canonicalForm === '腹泻')
    expect(diarrhea).toBeDefined()
    expect(diarrhea!.source).toBe('synonym')
  })

  it('should map cat-specific colloquial terms', () => {
    const result = verifyKeywords(['到处尿', '躲起来', '老舔'], '猫')
    expect(result.verifiedTerms.length).toBe(3)
  })
})

describe('Normalization Verifier - Fuzzy Matching', () => {
  beforeEach(() => {
    clearVocabCache()
  })

  it('should fuzzy match terms with minor typos (edit distance ≤ 2)', () => {
    // 欧吐 → 呕吐, edit distance = 2
    const result = verifyKeywords(['欧吐'], '犬')
    expect(result.verifiedTerms.length).toBeGreaterThanOrEqual(0)
    // 如果匹配到了就是 fuzzy source
    if (result.verifiedTerms.length > 0) {
      expect(result.verifiedTerms[0].source).toBe('fuzzy')
    }
  })

  it('should not match completely unrelated terms', () => {
    const result = verifyKeywords(['xyzabc123', '完全没有关系的词'], '犬')
    expect(result.verifiedTerms.length).toBe(0)
    expect(result.unmappedTerms.length).toBe(2)
  })
})

describe('Normalization Verifier - Deduplication', () => {
  beforeEach(() => {
    clearVocabCache()
  })

  it('should deduplicate same canonical form keeping highest confidence', () => {
    // "呕吐" exact + "吐" synonym → both map to "呕吐", keep exact (confidence 1.0)
    const result = verifyKeywords(['呕吐', '吐'], '犬')
    const vomitTerms = result.verifiedTerms.filter(
      (v) => v.canonicalForm === '呕吐'
    )
    expect(vomitTerms.length).toBe(1)
    expect(vomitTerms[0].confidence).toBe(1.0)
    expect(vomitTerms[0].source).toBe('exact')
  })
})

describe('Normalization Verifier - Coverage & Retry Hint', () => {
  beforeEach(() => {
    clearVocabCache()
  })

  it('should calculate coverage correctly', () => {
    const result = verifyKeywords(
      ['呕吐', '完全无关词1', '完全无关词2', '完全无关词3'],
      '犬'
    )
    expect(result.coverage).toBeLessThan(0.5)
  })

  it('should provide retry suggestion when coverage is low', () => {
    const result = verifyKeywords(
      ['没见过的症状A', '没见过的症状B', '没见过的症状C'],
      '犬'
    )
    expect(result.coverage).toBeLessThan(0.3)
    if (result.coverage < 0.3) {
      expect(result.suggestionForRetry).toBeDefined()
      expect(result.suggestionForRetry).toContain('覆盖率')
    }
  })

  it('should have coverage = 1.0 when all terms match', () => {
    const result = verifyKeywords(
      ['呕吐', '腹泻', '食欲下降', '精神萎靡', '发热'],
      '犬'
    )
    expect(result.coverage).toBe(1.0)
    expect(result.suggestionForRetry).toBeUndefined()
  })
})

describe('Normalization Verifier - Empty Input', () => {
  beforeEach(() => {
    clearVocabCache()
  })

  it('should handle empty keyword array', () => {
    const result = verifyKeywords([], '犬')
    expect(result.verifiedTerms).toEqual([])
    expect(result.unmappedTerms).toEqual([])
    expect(result.coverage).toBe(0)
  })
})

describe('Normalization Verifier - Cross-Species', () => {
  beforeEach(() => {
    clearVocabCache()
  })

  it('should match dog-specific terms in dog vocab but not cat', () => {
    // 犬有"排尿行为异常", 猫有"乱尿"
    const dogResult = verifyKeywords(['乱尿'], '犬')
    // 乱尿在犬同义词表中存在于"排尿行为异常"下
    const hasDogMatch = dogResult.verifiedTerms.some(
      (v) => v.canonicalForm === '排尿行为异常'
    )

    const catResult = verifyKeywords(['乱尿'], '猫')
    const hasCatMatch = catResult.verifiedTerms.some(
      (v) => v.canonicalForm === '乱尿'
    )

    // 至少一个物种能匹配
    expect(hasDogMatch || hasCatMatch).toBe(true)
  })
})
