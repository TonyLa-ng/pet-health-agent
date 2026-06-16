// ============================================
// Keyword Transformer Tests
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { transformKeywords, extractKeywordsCompat, mergeKeywords } from '../keyword-transformer'

// Mock callLLM to avoid real API calls
vi.mock('@/models/client', () => ({
  callLLM: vi.fn(),
}))

import { callLLM } from '@/models/client'

describe('Keyword Transformer - transformKeywords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should parse valid LLM JSON response', async () => {
    const mockResponse = {
      coreSymptoms: ['呕吐', '食欲下降', '精神萎靡'],
      expandedSynonyms: ['吐了', '不吃东西', '没精神'],
      diseaseDirections: ['消化系统', '急性胃炎'],
      confidence: 0.9,
    }

    vi.mocked(callLLM).mockResolvedValueOnce({
      success: true,
      content: JSON.stringify(mockResponse),
      error: null,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      switchedModel: false,
    })

    const result = await transformKeywords(
      '我家狗昨天吐了三次，不吃狗粮，没精神',
      '犬'
    )

    expect(result.coreSymptoms).toEqual(['呕吐', '食欲下降', '精神萎靡'])
    expect(result.expandedSynonyms).toEqual(['吐了', '不吃东西', '没精神'])
    expect(result.diseaseDirections).toEqual(['消化系统', '急性胃炎'])
    expect(result.confidence).toBe(0.9)
  })

  it('should handle JSON with markdown code block wrapper', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      success: true,
      content: '```json\n{"coreSymptoms":["腹泻"],"expandedSynonyms":[],"diseaseDirections":[],"confidence":0.8}\n```',
      error: null,
      usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
      switchedModel: false,
    })

    const result = await transformKeywords('狗拉稀了', '犬')
    expect(result.coreSymptoms).toEqual(['腹泻'])
    expect(result.confidence).toBe(0.8)
  })

  it('should filter out invalid entries (empty/short strings)', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      success: true,
      content: JSON.stringify({
        coreSymptoms: ['呕吐', '', 'a', null, '腹泻'],
        expandedSynonyms: [],
        diseaseDirections: ['消化系统'],
        confidence: 0.85,
      }),
      error: null,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      switchedModel: false,
    })

    const result = await transformKeywords('测试', '犬')
    expect(result.coreSymptoms).toEqual(['呕吐', '腹泻'])
  })

  it('should clamp confidence to [0, 1]', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      success: true,
      content: JSON.stringify({
        coreSymptoms: ['呕吐'],
        expandedSynonyms: [],
        diseaseDirections: [],
        confidence: 2.5,
      }),
      error: null,
      usage: null,
      switchedModel: false,
    })

    const result = await transformKeywords('测试', '犬')
    expect(result.confidence).toBe(1.0)
  })

  it('should return empty result on LLM failure', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      success: false,
      content: null,
      error: { type: 'network_error', message: 'Connection failed', retryable: true },
      usage: null,
      switchedModel: false,
    })

    const result = await transformKeywords('测试', '犬')
    expect(result.coreSymptoms).toEqual([])
    expect(result.expandedSynonyms).toEqual([])
    expect(result.confidence).toBe(0)
  })

  it('should return empty result on malformed JSON', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      success: true,
      content: 'not valid json at all {{{',
      error: null,
      usage: null,
      switchedModel: false,
    })

    const result = await transformKeywords('测试', '犬')
    expect(result.coreSymptoms).toEqual([])
    expect(result.confidence).toBe(0)
  })
})

describe('Keyword Transformer - extractKeywordsCompat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return flattened and deduplicated string array', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      success: true,
      content: JSON.stringify({
        coreSymptoms: ['呕吐', '腹泻'],
        expandedSynonyms: ['吐了', '拉稀'],
        diseaseDirections: ['消化系统', '腹泻'],
        confidence: 0.9,
      }),
      error: null,
      usage: null,
      switchedModel: false,
    })

    const result = await extractKeywordsCompat('测试', '犬')
    expect(result).toContain('呕吐')
    expect(result).toContain('腹泻')
    expect(result).toContain('消化系统')
    // 去重
    expect(result.filter((k) => k === '腹泻').length).toBe(1)
  })
})

describe('Keyword Transformer - mergeKeywords', () => {
  it('should merge LLM and rule-based keywords with LLM priority', () => {
    const llm = {
      coreSymptoms: ['呕吐', '食欲下降'],
      expandedSynonyms: ['吐了'],
      diseaseDirections: ['消化系统'],
      confidence: 0.9,
    }
    const ruleKeywords = ['腹泻', '精神萎靡', '呕吐'] // 呕吐重复

    const merged = mergeKeywords(llm, ruleKeywords)
    expect(merged).toContain('呕吐')
    expect(merged).toContain('食欲下降')
    expect(merged).toContain('吐了')
    expect(merged).toContain('腹泻')
    expect(merged).toContain('精神萎靡')
    // 无重复
    expect(merged.filter((k) => k === '呕吐').length).toBe(1)
  })

  it('should handle empty inputs', () => {
    const empty = {
      coreSymptoms: [],
      expandedSynonyms: [],
      diseaseDirections: [],
      confidence: 0,
    }
    const merged = mergeKeywords(empty, [])
    expect(merged).toEqual([])
  })
})
