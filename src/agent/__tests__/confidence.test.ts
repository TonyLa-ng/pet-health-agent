// ============================================
// M6: Confidence Calculator Tests
// ============================================

import { describe, it, expect } from 'vitest'
import { calculate, calcInfoCompleteness } from '../confidence'
import type { RawDiagnosis } from '../types'
import type { SymptomMatchInput } from '../confidence'

const baseDiagnosis: RawDiagnosis = {
  disease: '急性胃炎',
  confidence_raw: 0,
  supportingEvidence: '呕吐+食欲下降+精神萎靡',
  opposingEvidence: '无血便',
  differentialDiagnosis: ['肠道异物', '胰腺炎'],
}

describe('Confidence Calculation', () => {
  it('should give high confidence for full match', () => {
    const match: SymptomMatchInput = {
      matchRate: 0.85,
      primaryHitRate: 1.0,
      knowledgeConfidence: 'high',
    }
    const results = calculate(
      [baseDiagnosis],
      match,
      0.85,
      '犬',
      false,
      0
    )
    expect(results[0].confidence).toBeGreaterThanOrEqual(80)
    expect(results[0].badge).toBe('green')
  })

  it('should give medium confidence for partial match', () => {
    const match: SymptomMatchInput = {
      matchRate: 0.6,
      primaryHitRate: 0.67,
      knowledgeConfidence: 'high',
    }
    const results = calculate(
      [baseDiagnosis],
      match,
      0.7,
      '犬',
      false,
      0
    )
    expect(results[0].confidence).toBeGreaterThanOrEqual(65)
    expect(results[0].confidence).toBeLessThan(80)
    expect(results[0].badge).toBe('yellow')
  })

  it('should give orange badge for low confidence', () => {
    const match: SymptomMatchInput = {
      matchRate: 0.4,
      primaryHitRate: 0.5,
      knowledgeConfidence: 'medium',
    }
    const results = calculate(
      [baseDiagnosis],
      match,
      0.5,
      '犬',
      false,
      0
    )
    expect(results[0].confidence).toBeGreaterThanOrEqual(50)
    expect(results[0].confidence).toBeLessThan(65)
    expect(results[0].badge).toBe('orange')
  })

  it('should give red badge for very low confidence', () => {
    const match: SymptomMatchInput = {
      matchRate: 0.2,
      primaryHitRate: 0.3,
      knowledgeConfidence: 'low',
    }
    const results = calculate(
      [baseDiagnosis],
      match,
      0.3,
      '犬',
      false,
      0
    )
    expect(results[0].confidence).toBeLessThan(50)
    expect(results[0].badge).toBe('red')
  })

  it('should apply cross-species penalty (× 0.5)', () => {
    const match: SymptomMatchInput = {
      matchRate: 0.85,
      primaryHitRate: 1.0,
      knowledgeConfidence: 'high',
    }
    const native = calculate([baseDiagnosis], match, 0.85, '犬', false, 0)
    const cross = calculate([baseDiagnosis], match, 0.85, '犬', true, 0)

    expect(cross[0].confidence).toBe(Math.round(native[0].confidence * 0.5))
  })

  it('should deduct points for uncollectable fields', () => {
    const match: SymptomMatchInput = {
      matchRate: 0.85,
      primaryHitRate: 1.0,
      knowledgeConfidence: 'high',
    }
    const withoutPenalty = calculate([baseDiagnosis], match, 0.85, '犬', false, 0)
    const withPenalty = calculate([baseDiagnosis], match, 0.85, '犬', false, 3)

    expect(withPenalty[0].confidence).toBeLessThan(withoutPenalty[0].confidence)
  })

  it('should handle multiple diagnoses', () => {
    const diagnoses: RawDiagnosis[] = [
      baseDiagnosis,
      { ...baseDiagnosis, disease: '肠道异物' },
    ]
    const match: SymptomMatchInput = {
      matchRate: 0.85,
      primaryHitRate: 1.0,
      knowledgeConfidence: 'high',
    }
    const results = calculate(diagnoses, match, 0.85, '犬', false, 0)
    expect(results).toHaveLength(2)
    expect(results[0].disease).toBe('急性胃炎')
    expect(results[1].disease).toBe('肠道异物')
  })

  it('should score multiple diagnoses with their own symptom match evidence', () => {
    const diagnoses: RawDiagnosis[] = [
      baseDiagnosis,
      { ...baseDiagnosis, disease: '胰腺炎' },
    ]
    const fallbackMatch: SymptomMatchInput = {
      matchRate: 0.3,
      primaryHitRate: 0.3,
      knowledgeConfidence: 'medium',
    }

    const results = calculate(
      diagnoses,
      fallbackMatch,
      0.85,
      '犬',
      false,
      0,
      'knowledge_base',
      {
        急性胃炎: {
          matchRate: 0.35,
          primaryHitRate: 0.33,
          knowledgeConfidence: 'high',
          isCrossSpecies: false,
        },
        胰腺炎: {
          matchRate: 0.9,
          primaryHitRate: 1,
          knowledgeConfidence: 'high',
          isCrossSpecies: false,
        },
      }
    )

    expect(results[1].confidence).toBeGreaterThan(results[0].confidence)
  })

  it('should clamp confidence to 0-100 range', () => {
    const match: SymptomMatchInput = {
      matchRate: 0.85,
      primaryHitRate: 1.0,
      knowledgeConfidence: 'high',
    }
    const results = calculate([baseDiagnosis], match, 0.85, '犬', false, 0)
    expect(results[0].confidence).toBeGreaterThanOrEqual(0)
    expect(results[0].confidence).toBeLessThanOrEqual(100)
  })

  it('should always output integer confidence', () => {
    const match: SymptomMatchInput = {
      matchRate: 0.67,
      primaryHitRate: 0.8,
      knowledgeConfidence: 'high',
    }
    const results = calculate([baseDiagnosis], match, 0.7, '犬', false, 0)
    expect(Number.isInteger(results[0].confidence)).toBe(true)
  })
})

describe('Info Completeness Calculation', () => {
  it('should return 1.0 for all fields collected', () => {
    expect(calcInfoCompleteness(9, 9)).toBe(1.0)
  })

  it('should return 0.5 for half fields collected', () => {
    const result = calcInfoCompleteness(5, 9)
    expect(result).toBeCloseTo(0.56, 0)
  })

  it('should return 0 for no fields', () => {
    expect(calcInfoCompleteness(0, 9)).toBe(0)
  })

  it('should cap at 1.0', () => {
    expect(calcInfoCompleteness(15, 9)).toBe(1.0)
  })
})
