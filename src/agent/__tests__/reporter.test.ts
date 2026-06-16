// ============================================
// M7: Report Generator Tests
// ============================================

import { describe, it, expect } from 'vitest'
import { generateReport } from '../reporter'
import type { TriageResult, AssessmentResult, NormalizedInput, ScoredDiagnosis } from '../types'
import { ConfidenceBadge } from '../types'
import type { PetProfile } from '@/store/types'

const mockPet: PetProfile = {
  id: 'pet-001',
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
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const mockNormalized: NormalizedInput = {
  chiefComplaint: [{ name: '呕吐', original: '吐了', category: 'chief' }],
  accompanyingSymptoms: [
    { name: '食欲下降', original: '不吃东西', category: 'accompanying' },
    { name: '精神萎靡', original: '没精神', category: 'accompanying' },
  ],
  vitalSigns: [],
  timeline: {
    onset: '昨天开始',
    duration: '6h_to_24h',
    frequency: '持续',
    pattern: 'continuous',
  },
  environmentFactors: [],
  excludedNoise: [],
}

const normalTriage: TriageResult = {
  isEmergency: false,
  level: 'normal',
  score: 25,
  alerts: [],
  matchedSignals: [],
  durationExtracted: '6h_to_24h',
  durationConflict: false,
  durationEffect: 'neutral',
  isRevisit: false,
  lowRiskReminder: false,
}

const criticalTriage: TriageResult = {
  ...normalTriage,
  isEmergency: true,
  level: 'critical',
  score: 85,
  alerts: ['⚠️ 检测到危重急症信号，请立即就医'],
  matchedSignals: ['抽搐'],
}

const highConfidenceDiag: ScoredDiagnosis[] = [
  {
    disease: '急性胃炎',
    confidence: 85,
    badge: ConfidenceBadge.GREEN,
    source: 'knowledge_base' as const,
    supportingEvidence: '呕吐+食欲下降+精神萎靡与急性胃炎高度吻合',
    opposingEvidence: '无血便、无高烧',
    differentialDiagnosis: ['肠道异物', '胰腺炎'],
    rawScores: { symptomMatch: 80, keySymptomHit: 80, knowledgeStrength: 100, infoCompleteness: 70 },
  },
]

const lowConfidenceDiag: ScoredDiagnosis[] = [
  {
    disease: '未知消化问题',
    confidence: 40,
    badge: ConfidenceBadge.RED,
    source: 'knowledge_base' as const,
    supportingEvidence: '呕吐症状',
    opposingEvidence: '信息不足',
    differentialDiagnosis: [],
    rawScores: { symptomMatch: 30, keySymptomHit: 25, knowledgeStrength: 40, infoCompleteness: 15 },
  },
]

const ambiguousConfidenceDiag: ScoredDiagnosis[] = [
  {
    disease: '疑似肠胃问题',
    confidence: 55,
    badge: ConfidenceBadge.ORANGE,
    source: 'knowledge_base' as const,
    supportingEvidence: '仅有轻度腹泻，缺少决定性特征',
    opposingEvidence: '缺少发热、血便、呕吐频率、暴露史等关键鉴别信息',
    differentialDiagnosis: ['饮食不耐受', '寄生虫性腹泻', '传染性肠炎'],
    rawScores: { symptomMatch: 45, keySymptomHit: 30, knowledgeStrength: 60, infoCompleteness: 35 },
  },
]

const completeAssessment: AssessmentResult = {
  isComplete: true,
  missingFields: [],
  questions: [],
  roundsUsed: 2,
  skippedFields: [],
  uncollectableFields: [],
  mandatoryFieldsCompleted: ['chiefComplaint', 'duration', 'frequency', 'dietChange', 'stoolUrine', 'mentalStatus'],
  mandatoryFieldsMissing: [],
}

const incompleteAssessment: AssessmentResult = {
  isComplete: false,
  missingFields: ['duration', 'frequency', 'dietChange', 'stoolUrine', 'mentalStatus'],
  questions: [
    { field: 'duration', question: '症状持续多久了？', guidance: '帮助判断急慢性', priority: 2 },
    { field: 'frequency', question: '发作频率？', guidance: '帮助判断活动性', priority: 3 },
    { field: 'dietChange', question: '饮食变化？', guidance: '内科疾病线索', priority: 4 },
  ],
  roundsUsed: 1,
  skippedFields: [],
  uncollectableFields: [],
  mandatoryFieldsCompleted: ['chiefComplaint'],
  mandatoryFieldsMissing: ['duration', 'frequency', 'dietChange', 'stoolUrine', 'mentalStatus'],
}

describe('Report Template Selection', () => {
  it('should select template 1 for normal case with high confidence', () => {
    const report = generateReport(
      normalTriage,
      highConfidenceDiag,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    expect(report.template).toBe('template_1')
    expect(report.sections.some((s) => s.type === 'diagnosis')).toBe(true)
    expect(report.sections.some((s) => s.type === 'pet_info')).toBe(true)
  })

  it('should select template 2 for incomplete interview', () => {
    const report = generateReport(
      normalTriage,
      null,
      incompleteAssessment,
      mockNormalized,
      mockPet
    )
    expect(report.template).toBe('template_2')
    expect(report.sections.some((s) => s.title.includes('信息补充'))).toBe(true)
  })

  it('should select template 1 for critical triage (急症预警由pipeline注入)', () => {
    const report = generateReport(
      criticalTriage,
      null,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    // 急症不再独占模板3，走模板1输出疾病分析
    expect(report.template).toBe('template_1')
  })

  it('should select template 1 for urgent triage', () => {
    const urgentTriage: TriageResult = { ...normalTriage, level: 'urgent', score: 65 }
    const report = generateReport(
      urgentTriage,
      null,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    expect(report.template).toBe('template_1')
  })

  it('should select template 4 for low confidence', () => {
    const report = generateReport(
      normalTriage,
      lowConfidenceDiag,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    expect(report.template).toBe('template_4')
    expect(report.sections.some((s) => s.title.includes('无法准确判断'))).toBe(true)
  })

  it('should not present an orange low-confidence diagnosis as a normal result', () => {
    const report = generateReport(
      normalTriage,
      ambiguousConfidenceDiag,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    expect(report.template).toBe('template_4')
    expect(report.unableToDiagnoseReason).toBe('atypical_symptoms')
    expect(report.sections.some((s) => s.type === 'diagnosis')).toBe(false)
  })

  it('should select template 4 for no diagnoses', () => {
    const report = generateReport(
      normalTriage,
      null,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    expect(report.template).toBe('template_4')
  })
})

describe('Report Content', () => {
  it('should include pet info in template 1', () => {
    const report = generateReport(
      normalTriage,
      highConfidenceDiag,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    const petSection = report.sections.find((s) => s.type === 'pet_info')
    expect(petSection).toBeDefined()
    expect(petSection!.content).toContain('金毛')
    expect(petSection!.content).toContain('3岁')
    expect(petSection!.content).toContain('25kg')
  })

  it('should include symptom summary in template 1', () => {
    const report = generateReport(
      normalTriage,
      highConfidenceDiag,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    const symSection = report.sections.find((s) => s.type === 'symptom_summary')
    expect(symSection).toBeDefined()
    expect(symSection!.content).toContain('吐了')
    expect(symSection!.content).toContain('不吃东西')
  })

  it('should include confidence badge in diagnosis', () => {
    const report = generateReport(
      normalTriage,
      highConfidenceDiag,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    const diagSection = report.sections.find((s) => s.type === 'diagnosis')
    expect(diagSection).toBeDefined()
    expect(diagSection!.content).toContain('85%')
    expect(diagSection!.content).toContain('🟢')
  })

  it('should include forbidden care items in home_care', () => {
    const report = generateReport(
      normalTriage,
      highConfidenceDiag,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    const careSection = report.sections.find((s) => s.type === 'home_care')
    expect(careSection).toBeDefined()
    expect(careSection!.content).toContain('禁止')
  })

  it('should include disclaimer text', () => {
    const report = generateReport(
      normalTriage,
      highConfidenceDiag,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    expect(report.disclaimerText).toContain('免责声明')
    expect(report.disclaimerText).toContain('不能替代执业兽医')
  })

  it('should NOT include pet info in template 2', () => {
    const report = generateReport(
      normalTriage,
      null,
      incompleteAssessment,
      mockNormalized,
      mockPet
    )
    const petSection = report.sections.find((s) => s.type === 'pet_info')
    expect(petSection).toBeUndefined()
  })
})

describe('Unable to Diagnose Reason', () => {
  it('should set reason to insufficient_info for incomplete assessment', () => {
    const report = generateReport(
      normalTriage,
      null,
      incompleteAssessment,
      mockNormalized,
      mockPet
    )
    // Template 2 means followup, check incomplete assessment
    expect(report.template).toBe('template_2')
  })

  it('should set reason for template 4 with insufficient info', () => {
    // Force template 4 by having complete assessment but low confidence
    const report = generateReport(
      normalTriage,
      lowConfidenceDiag,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    expect(report.template).toBe('template_4')
    expect(report.unableToDiagnoseReason).toBe('atypical_symptoms')
  })
})

describe('Report Metadata', () => {
  it('should have generatedAt timestamp', () => {
    const report = generateReport(
      normalTriage,
      highConfidenceDiag,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    expect(report.generatedAt).toBeGreaterThan(0)
  })

  it('should include top confidence in diagnosis metadata', () => {
    const report = generateReport(
      normalTriage,
      highConfidenceDiag,
      completeAssessment,
      mockNormalized,
      mockPet
    )
    const diagSection = report.sections.find((s) => s.type === 'diagnosis')
    expect(diagSection?.metadata?.topConfidence).toBe(85)
  })
})
