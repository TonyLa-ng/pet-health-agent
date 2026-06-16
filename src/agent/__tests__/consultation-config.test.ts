import { describe, expect, it } from 'vitest'
import { getConsultationConfig } from '../consultation-config'

describe('consultation config', () => {
  it('loads shared candidate scoring weights from JSON', () => {
    const config = getConsultationConfig('犬')

    expect(config.candidate.categoryHit).toBe(28)
    expect(config.candidate.primarySymptomHit).toBe(12)
    expect(config.candidate.negativePrimaryPenalty).toBe(22)
    expect(config.convergence.minimumReportConfidence).toBe(65)
  })

  it('returns independent copies so tests and callers cannot mutate global config', () => {
    const first = getConsultationConfig('猫')
    first.convergence.minimumReportConfidence = 10

    const second = getConsultationConfig('猫')

    expect(second.convergence.minimumReportConfidence).toBe(65)
  })
})
