import { describe, expect, it } from 'vitest'
import { generateReport } from '../reporter'
import type { AssessmentResult, NormalizedInput, ScoredDiagnosis, TriageResult } from '../types'
import { ConfidenceBadge } from '../types'
import type { PetProfile } from '@/store/types'
import { loadAllKnowledge } from '@/knowledge/loader'
import type { VetMapSearchResult } from '@/tools/vet-map'

const baseTriage: TriageResult = {
  isEmergency: false,
  level: 'normal',
  score: 0,
  alerts: [],
  matchedSignals: [],
  durationExtracted: 'unknown',
  durationConflict: false,
  durationEffect: 'neutral',
  isRevisit: false,
  lowRiskReminder: false,
}

const baseAssessment: AssessmentResult = {
  isComplete: true,
  missingFields: [],
  questions: [],
  roundsUsed: 2,
  skippedFields: [],
  uncollectableFields: [],
  mandatoryFieldsCompleted: ['chiefComplaint'],
  mandatoryFieldsMissing: [],
}

const normalized: NormalizedInput = {
  chiefComplaint: [{ name: '腹泻', original: '拉肚子', category: 'chief' }],
  accompanyingSymptoms: [{ name: '呕吐', original: '吐', category: 'accompanying' }],
  vitalSigns: [],
  timeline: { onset: '', duration: 'unknown', frequency: '', pattern: 'unknown' },
  environmentFactors: ['近期外出'],
  excludedNoise: [],
}

const pet: PetProfile = {
  id: 'pet-1',
  species: '犬',
  breed: '中华田园犬',
  age: 0.25,
  weight: 4,
  gender: 'male',
  neutered: false,
  vaccination: '未完成',
  medicalHistory: '无',
  allergies: '无',
  chronicConditions: '无',
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

function diagnosis(disease: string, confidence = 88): ScoredDiagnosis {
  return {
    disease,
    confidence,
    badge: ConfidenceBadge.GREEN,
    source: 'knowledge_base',
    supportingEvidence: '幼犬、呕吐、腹泻、接触史',
    opposingEvidence: '',
    differentialDiagnosis: [],
    rawScores: {
      symptomMatch: 90,
      keySymptomHit: 90,
      knowledgeStrength: 100,
      infoCompleteness: 80,
    },
  }
}

describe('Dynamic report generation', () => {
  it('uses disease-specific tests, forbidden care, and report profile for parvovirus', () => {
    const parvo = loadAllKnowledge('犬').find((entry) => entry.id === 'canine-inf-001')
    const report = generateReport(
      { ...baseTriage, level: 'urgent', score: 60 },
      [diagnosis('犬细小病毒感染')],
      baseAssessment,
      normalized,
      pet,
      'knowledge_base',
      [],
      { knowledgeEntries: parvo ? [parvo] : [] }
    )

    const diff = report.sections.find((section) => section.type === 'differential')
    const care = report.sections.find((section) => section.type === 'home_care')

    expect(diff?.content).toMatch(/CPV|PCR|血常规|电解质/)
    expect(care?.content).toMatch(/静脉输液|隔离|含氯|止泻药|大量饮水/)
    expect(care?.content).not.toMatch(/恢复进食时从少量易消化食物开始/)
  })

  it('includes concrete hospital map results in critical reports', () => {
    const mapResult: VetMapSearchResult = {
      status: 'ok',
      hospitals: [
        {
          name: '24小时宠物急诊中心',
          address: '24小时宠物急诊中心, 科苑路200号, 浦东新区, 上海市, 中国',
          latitude: 31.21,
          longitude: 121.59,
        },
      ],
      query: '上海市浦东新区 动物医院 24小时',
    }

    const report = generateReport(
      { ...baseTriage, isEmergency: true, level: 'critical', score: 90, matchedSignals: ['血便'] },
      [diagnosis('犬细小病毒感染')],
      baseAssessment,
      normalized,
      pet,
      'knowledge_base',
      [],
      { vetMap: mapResult }
    )

    const emergency = report.sections.find((section) => section.type === 'emergency_signs')
    expect(emergency?.content).toMatch(/24小时宠物急诊中心/)
    expect(emergency?.content).toMatch(/科苑路200号/)
  })
})
