import { describe, expect, it, vi } from 'vitest'
import type { NormalizedInput } from '../types'
import type { SearchResult } from '@/knowledge/types'
import { loadAllKnowledge } from '@/knowledge/loader'

const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(async () => {
    throw new Error('LLM must not be called for knowledge-base diagnoses')
  }),
  checkTokenBudget: vi.fn(() => ({
    total: 1000,
    used: 100,
    remaining: 900,
    isExceeded: false,
    strategy: 'full' as const,
  })),
}))

vi.mock('@/models/client', () => ({
  callLLM: mocks.callLLM,
  checkTokenBudget: mocks.checkTokenBudget,
}))

import { diagnose } from '../diagnostician'

function normalizedDogVomiting(): NormalizedInput {
  return {
    chiefComplaint: [
      { name: '呕吐', original: '狗吐了', category: 'chief' },
      { name: '腹泻', original: '拉肚子', category: 'chief' },
    ],
    accompanyingSymptoms: [
      { name: '食欲下降', original: '不吃东西', category: 'accompanying' },
    ],
    vitalSigns: [],
    timeline: {
      onset: '',
      duration: 'unknown',
      frequency: '',
      pattern: 'unknown',
    },
    environmentFactors: [],
    excludedNoise: [],
  }
}

describe('diagnostician knowledge-base authority', () => {
  it('does not call LLM when KB search results are already available', async () => {
    const entry = loadAllKnowledge('犬').find((item) => item.id === 'canine-dig-003')
    expect(entry).toBeDefined()
    const precomputed: SearchResult[] = [{
      entry: entry!,
      score: 0.72,
      matchDetails: {
        symptomOverlap: 3,
        primaryHitRate: 0.8,
        isCrossSpecies: false,
      },
    }]

    const result = await diagnose(
      normalizedDogVomiting(),
      '犬',
      undefined,
      '狗吐了拉肚子，不吃东西',
      [],
      precomputed
    )

    expect(mocks.callLLM).not.toHaveBeenCalled()
    expect(result.source).toBe('knowledge_base')
    expect(result.rawDiagnoses[0].disease).toBe(entry!.disease)
  })
})
