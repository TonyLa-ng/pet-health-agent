import { describe, expect, it } from 'vitest'
import { selectNextQuestions } from '../question-selector'
import type { KnowledgeEntry } from '@/knowledge/types'
import type { RankedDiseaseCandidate } from '../candidate-ranker'

function makeEntry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: overrides.id || 'entry',
    disease: overrides.disease || '测试疾病',
    species: ['犬'],
    category: overrides.category || '消化系统',
    symptoms: overrides.symptoms || {
      primary: ['呕吐'],
      secondary: ['食欲下降'],
      detail: {},
    },
    urgency: overrides.urgency || 'medium',
    diagnosis_basis: 'basis',
    home_care: 'care',
    forbidden_care: [],
    medication: [],
    vet_threshold: 'threshold',
    confidence: 'high',
    differential_diagnosis: [],
    references: [],
    version: 1,
    status: 'active',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    reviewed_by: null,
    ...overrides,
  }
}

function makeRanked(entry: KnowledgeEntry, score: number): RankedDiseaseCandidate {
  return {
    entry,
    disease: entry.disease,
    score,
    coherence: {
      score,
      categoryScore: 20,
      symptomCoverage: 20,
      keySymptomScore: 0,
      riskFactorScore: 0,
      counterEvidencePenalty: 0,
      matchedSymptoms: [],
      matchedRiskFactors: [],
      explicitCounterEvidence: [],
      reason: 'test',
    },
    matchedCore: [],
    matchedSecondary: [],
    deniedCore: [],
    deniedSecondary: [],
    missingCore: entry.key_symptoms?.filter((symptom) => symptom.weight === 'core').map((symptom) => symptom.term) || [],
    matchedRisks: [],
    trace: [],
    reason: 'test',
  }
}

describe('question selector', () => {
  it('prioritizes observable differentiators between similar digestive diseases', () => {
    const gastritis = makeEntry({
      id: 'gastritis',
      disease: '急性胃肠炎',
      symptoms: {
        primary: ['呕吐', '腹泻'],
        secondary: ['轻度腹痛', '食欲下降'],
        detail: {},
      },
      key_symptoms: [
        { term: '腹泻', weight: 'core', ask: '是否有腹泻或软便？', supports: '支持胃肠炎' },
        { term: '轻度腹痛', weight: 'major', ask: '腹痛是否较轻，仍可活动？', supports: '支持胃肠炎' },
      ],
    })
    const pancreatitis = makeEntry({
      id: 'pancreatitis',
      disease: '胰腺炎',
      symptoms: {
        primary: ['剧烈腹痛', '剧烈呕吐', '食欲废绝'],
        secondary: ['弓背姿势', '高脂肪饮食史'],
        detail: {},
      },
      key_symptoms: [
        { term: '剧烈腹痛', weight: 'core', ask: '是否有明显腹痛、弓背或祈祷姿势？', supports: '支持胰腺炎' },
        { term: '高脂肪饮食史', weight: 'major', ask: '最近是否吃过肥肉、油炸或其他高脂肪食物？', supports: '支持胰腺炎' },
      ],
      required_tests: [
        { test: '犬胰腺特异性脂肪酶检测', reason: '确诊胰腺炎', priority: 'required' },
        { test: '腹部超声', reason: '评估胰腺和腹腔并发症', priority: 'recommended' },
      ],
    })

    const questions = selectNextQuestions({
      rankedCandidates: [makeRanked(gastritis, 74), makeRanked(pancreatitis, 72)],
      askedQuestions: [],
      confirmedSymptoms: ['呕吐'],
      deniedSymptoms: [],
      maxQuestions: 3,
    })

    expect(questions.length).toBeGreaterThan(0)
    expect(questions[0].question).toMatch(/腹痛|弓背|祈祷|高脂肪|肥肉|油炸/)
    expect(questions[0].informationGain).toBeGreaterThan(0)
  })

  it('does not ask hospital-only tests as follow-up questions', () => {
    const parvo = makeEntry({
      id: 'parvo',
      disease: '犬细小病毒病',
      category: '传染病',
      symptoms: {
        primary: ['剧烈呕吐', '血便（番茄酱样）'],
        secondary: ['白细胞显著下降', '脱水'],
        detail: {},
      },
      key_symptoms: [
        { term: '血便（番茄酱样）', weight: 'core', ask: '粪便是否番茄汁样、鲜红血便或黑血便？', supports: '支持细小' },
        { term: '白细胞显著下降', weight: 'core', ask: '血常规是否提示白细胞显著下降？', supports: '支持细小' },
      ],
      required_tests: [
        { test: 'CPV抗原快速检测', reason: '确诊细小', priority: 'required' },
        { test: '血常规', reason: '评估白细胞下降', priority: 'required' },
      ],
    })
    const genericEnteritis = makeEntry({
      id: 'enteritis',
      disease: '急性肠炎',
      symptoms: {
        primary: ['腹泻', '呕吐'],
        secondary: ['食欲下降'],
        detail: {},
      },
      key_symptoms: [
        { term: '腹泻', weight: 'core', ask: '是否为普通水样便或软便？', supports: '支持肠炎' },
      ],
    })

    const questions = selectNextQuestions({
      rankedCandidates: [makeRanked(parvo, 68), makeRanked(genericEnteritis, 66)],
      askedQuestions: [],
      confirmedSymptoms: ['呕吐'],
      deniedSymptoms: [],
    })

    const text = questions.map((question) => question.question).join('\n')
    expect(text).toMatch(/粪便|血便|番茄|黑血便/)
    expect(text).not.toMatch(/血常规|白细胞|CPV|抗原|检测|超声|B超|X光|CT|MRI/)
  })

  it('skips already answered evidence and previously asked questions', () => {
    const disease = makeEntry({
      id: 'disease',
      disease: '测试病',
      key_symptoms: [
        { term: '呕吐', weight: 'core', ask: '是否呕吐？', supports: '支持测试病' },
        { term: '腹泻', weight: 'core', ask: '是否腹泻？', supports: '支持测试病' },
      ],
    })
    const other = makeEntry({
      id: 'other',
      disease: '其他病',
      key_symptoms: [
        { term: '咳嗽', weight: 'core', ask: '是否咳嗽？', supports: '支持其他病' },
      ],
    })

    const questions = selectNextQuestions({
      rankedCandidates: [makeRanked(disease, 60), makeRanked(other, 59)],
      askedQuestions: ['是否腹泻？'],
      confirmedSymptoms: ['呕吐'],
      deniedSymptoms: [],
    })

    expect(questions.map((question) => question.question)).not.toContain('是否呕吐？')
    expect(questions.map((question) => question.question)).not.toContain('是否腹泻？')
  })
})
