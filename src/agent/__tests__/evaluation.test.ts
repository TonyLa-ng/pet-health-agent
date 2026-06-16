import { describe, expect, it } from 'vitest'
import cases from '../../../data/evaluation/consultation-cases.json'
import { evaluateConsultationCases, type EvaluationCase } from '../evaluation'
import { evaluateKnowledgeQuality } from '@/knowledge/quality-gate'

describe('consultation evaluation', () => {
  it('reports core offline metrics and species leakage', () => {
    const report = evaluateConsultationCases(cases as EvaluationCase[])

    expect(report.totalCases).toBe(cases.length)
    expect(report.metrics.top3Recall).toBeGreaterThan(0)
    expect(report.metrics.crossSpeciesLeaks).toBe(0)
    expect(report.caseResults[0]).toHaveProperty('topCandidates')
    expect(report.caseResults[0]).toHaveProperty('askedQuestionCount')
  })

  it('surfaces current knowledge coverage gaps without fabricating entries', () => {
    const quality = evaluateKnowledgeQuality({ minimumActiveEntriesPerSpecies: 100 })

    expect(quality.species['犬'].activeCount).toBeGreaterThan(0)
    expect(quality.species['猫'].activeCount).toBeGreaterThan(0)
    expect(quality.passed).toBe(false)
    expect(quality.species['犬'].missingToMinimum + quality.species['猫'].missingToMinimum).toBeGreaterThan(0)
  })
})
