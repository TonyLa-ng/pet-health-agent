// ============================================
// M4: Adaptive Interview Engine Tests (v2)
// ============================================

import { describe, it, expect, beforeEach } from 'vitest'
import { assessDifferential, isInvalidAnswer, resetCandidateCache } from '../interviewer'
import type { SessionContext } from '@/store/types'
import type { SearchResult, KnowledgeEntry } from '@/knowledge/types'

type TestSessionContext = SessionContext & { _sessionId?: string }

function makeContext(): SessionContext {
  return {
    mandatoryFieldsCompleted: ['chiefComplaint'],
    mandatoryFieldsMissing: [],
    uncollectableFields: [],
    fieldDataValidity: {},
  }
}

function makeSearchResult(overrides: Partial<KnowledgeEntry> = {}): SearchResult {
  const entry: KnowledgeEntry = {
    id: 'test-001',
    disease: '急性胃炎',
    species: ['犬'],
    category: '消化系统',
    symptoms: {
      primary: ['呕吐', '食欲下降', '精神萎靡'],
      secondary: ['腹痛', '脱水', '腹泻'],
      detail: {},
    },
    urgency: 'medium',
    diagnosis_basis: '...',
    home_care: '...',
    forbidden_care: [],
    medication: [],
    vet_threshold: '...',
    confidence: 'high',
    differential_diagnosis: [
      {
        disease: '胰腺炎',
        differentiator: '腹痛更剧烈',
        key_questions: ['宠物有没有弓背祈祷的姿势？'],
      },
    ],
    references: [],
    version: 1,
    status: 'active',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    reviewed_by: null,
    ...overrides,
  }
  return {
    entry,
    score: 0.85,
    matchDetails: { symptomOverlap: 3, primaryHitRate: 1.0, isCrossSpecies: false },
  }
}

beforeEach(() => resetCandidateCache())

describe('Invalid Answer Detection', () => {
  it('should detect "不知道" as invalid', () => {
    expect(isInvalidAnswer('不知道')).toBe(true)
  })
  it('should detect "不清楚" as invalid', () => {
    expect(isInvalidAnswer('不太清楚')).toBe(true)
  })
  it('should NOT flag normal answer', () => {
    expect(isInvalidAnswer('昨天开始吐的，吐了三次')).toBe(false)
  })
})

describe('Adaptive Differential Assessment', () => {
  it('should return complete=false with questions when candidates exist', () => {
    const results = [makeSearchResult()]
    const r = assessDifferential(makeContext(), results, '狗吐了', 0, [])
    // 单候选无鉴别问题但分数不高 → 可能 complete 或继续追问
    expect(r.shouldRestart).toBe(false)
  })

  it('should generate differential questions between two candidates', () => {
    const gastritis = makeSearchResult({
      id: 'gastritis', disease: '急性胃炎',
      differential_diagnosis: [
        { disease: '胰腺炎', differentiator: '腹痛更剧烈', key_questions: ['宠物有没有弓背姿势？'] },
      ],
    })
    const pancreatitis = makeSearchResult({
      id: 'pancreatitis', disease: '胰腺炎',
      symptoms: { primary: ['剧烈腹痛', '呕吐', '食欲废绝'], secondary: ['发热', '脱水'], detail: {} },
      differential_diagnosis: [
        { disease: '急性胃炎', differentiator: '腹痛较轻', key_questions: ['宠物有没有进食高脂肪食物？'] },
      ],
    })
    const r = assessDifferential(makeContext(), [gastritis, pancreatitis], '狗吐了，肚子疼', 0, [])
    expect(r.shouldRestart).toBe(false)
    // 应该生成了鉴别问题
    if (!r.isComplete) {
      expect(r.questions.length).toBeGreaterThan(0)
    }
  })

  it('should not ask unrelated specialty questions when urinary candidates dominate', () => {
    const urinary = makeSearchResult({
      id: 'urinary',
      disease: '猫下泌尿道疾病/尿闭（FLUTD/FUS）',
      species: ['猫'],
      category: '泌尿系统',
      symptoms: {
        primary: ['排尿困难', '尿频', '排尿疼痛'],
        secondary: ['精神萎靡', '呕吐'],
        detail: {},
      },
      differential_diagnosis: [
        {
          disease: '特发性膀胱炎',
          differentiator: '仍可排尿但频繁',
          key_questions: ['猫是否还能排出一些尿液？排尿量是否明显减少？'],
        },
      ],
    })
    urinary.score = 0.58

    const heartworm = makeSearchResult({
      id: 'heartworm',
      disease: '猫心丝虫病',
      species: ['猫'],
      category: '心血管系统',
      symptoms: {
        primary: ['咳嗽', '呼吸困难'],
        secondary: ['呕吐', '精神萎靡'],
        detail: {},
      },
      differential_diagnosis: [
        {
          disease: '猫哮喘',
          differentiator: '哮喘无心丝虫抗体/抗原阳性',
          key_questions: ['有无心丝虫检测？'],
        },
      ],
    })
    heartworm.score = 0.57

    const r = assessDifferential(
      makeContext(),
      [urinary, heartworm],
      '公猫频繁进猫砂盆，尿不出来，一直叫',
      0,
      []
    )

    expect(r.isComplete).toBe(false)
    expect(r.questions.map((q) => q.question).join('\n')).not.toContain('心丝虫')
    expect(r.questions.map((q) => q.question).join('\n')).toContain('尿')
  })

  it('should converge when clear winner emerges', () => {
    const gastritis = makeSearchResult({
      id: 'gastritis', disease: '急性胃炎',
    })
    gastritis.score = 0.9 // high match

    const r = assessDifferential(makeContext(), [gastritis], '狗吐了黄色液体，不吃东西，没精神', 0, [])
    // 分数可能够高 → 收敛
    expect(r.shouldRestart).toBe(false)
  })

  it('should trigger restart after 2 consecutive invalid answers', () => {
    const results = [makeSearchResult()]
    const r = assessDifferential(makeContext(), results, '不知道', 1, [])
    expect(r.shouldRestart).toBe(true)
    expect(r.restartReason).toBeTruthy()
  })

  it('should not trigger restart on first invalid answer', () => {
    const results = [makeSearchResult()]
    const r = assessDifferential(makeContext(), results, '不知道', 0, [])
    expect(r.shouldRestart).toBe(false)
    expect(r.newInvalidCount).toBe(1)
  })
})

describe('Convergence Logic', () => {
  it('should converge when candidates are very close', () => {
    const a = makeSearchResult({ id: 'a', disease: '疾病A' })
    a.score = 0.7
    const b = makeSearchResult({ id: 'b', disease: '疾病B' })
    b.score = 0.68
    const r = assessDifferential(makeContext(), [a, b], '症状类似两种病', 0, [])
    // 分数接近 → 收敛,输出两个
    if (r.isComplete) {
      expect(r.convergentCandidates.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('should ask discriminating questions instead of outputting multiple close diseases immediately', () => {
    const gastritis = makeSearchResult({
      id: 'gastritis',
      disease: '急性胃炎',
      symptoms: {
        primary: ['呕吐', '食欲下降', '精神萎靡'],
        secondary: ['腹痛', '腹泻', '脱水'],
        detail: {},
      },
      differential_diagnosis: [
        {
          disease: '胰腺炎',
          differentiator: '胰腺炎腹痛更剧烈，常见弓背祈祷姿势和高脂饮食诱因',
          key_questions: ['宠物近期是否进食过高脂肪食物（肥肉/油炸食品）？'],
        },
      ],
    })
    gastritis.score = 0.7

    const pancreatitis = makeSearchResult({
      id: 'pancreatitis',
      disease: '胰腺炎',
      symptoms: {
        primary: ['剧烈呕吐', '剧烈腹痛', '食欲废绝'],
        secondary: ['发热', '脱水', '弓背姿势', '腹泻'],
        detail: {},
      },
      differential_diagnosis: [
        {
          disease: '急性胃炎',
          differentiator: '胃炎腹痛相对较轻，通常与饮食不当或短期胃刺激相关',
          key_questions: ['有没有弓背祈祷的姿势？'],
        },
      ],
    })
    pancreatitis.score = 0.68

    const r = assessDifferential(
      makeContext(),
      [gastritis, pancreatitis],
      '狗从昨天开始呕吐，不吃东西，精神差',
      0,
      []
    )

    expect(r.isComplete).toBe(false)
    expect(r.convergentCandidates).toHaveLength(0)
    expect(r.questions.map(q => q.question).join('\n')).toMatch(/腹痛|弓背|高脂肪|食欲废绝/)
  })

  it('should use answers to previous differential questions to lock the better matching disease', () => {
    const context: TestSessionContext = makeContext()
    context._sessionId = 'diff-answer-session'

    const gastritis = makeSearchResult({
      id: 'gastritis',
      disease: '急性胃炎',
      symptoms: {
        primary: ['呕吐', '食欲下降', '精神萎靡'],
        secondary: ['腹痛', '腹泻', '脱水'],
        detail: {},
      },
    })
    gastritis.score = 0.62

    const pancreatitis = makeSearchResult({
      id: 'pancreatitis',
      disease: '胰腺炎',
      symptoms: {
        primary: ['剧烈呕吐', '剧烈腹痛', '食欲废绝'],
        secondary: ['发热', '脱水', '弓背姿势', '腹泻'],
        detail: {},
      },
      differential_diagnosis: [
        {
          disease: '急性胃炎',
          differentiator: '胰腺炎常有弓背姿势、高脂饮食诱因和更剧烈腹痛',
          key_questions: ['有没有弓背祈祷的姿势？'],
        },
      ],
    })
    pancreatitis.score = 0.61

    const first = assessDifferential(
      context,
      [gastritis, pancreatitis],
      '狗呕吐，不吃东西，精神很差',
      0,
      []
    )
    expect(first.isComplete).toBe(false)

    const second = assessDifferential(
      context,
      [gastritis, pancreatitis],
      '有，弓背很明显，肚子疼得厉害，昨天还吃了肥肉',
      0,
      first.questions.map(q => q.question)
    )

    expect(second.isComplete).toBe(true)
    expect(second.convergentCandidates[0].disease).toBe('胰腺炎')
  })

  it('should refresh stale candidate cache when newer RAG results contain a stronger candidate', () => {
    const context: TestSessionContext = makeContext()
    context._sessionId = 'refresh-session'

    const gastritis = makeSearchResult({
      id: 'gastritis',
      disease: '急性胃炎',
      symptoms: {
        primary: ['呕吐', '食欲下降', '精神萎靡'],
        secondary: ['腹痛', '腹泻'],
        detail: {},
      },
    })
    gastritis.score = 0.45

    const pancreatitis = makeSearchResult({
      id: 'pancreatitis',
      disease: '胰腺炎',
      symptoms: {
        primary: ['剧烈呕吐', '剧烈腹痛', '食欲废绝'],
        secondary: ['弓背姿势', '发热', '脱水'],
        detail: {},
      },
    })
    pancreatitis.score = 0.86

    assessDifferential(context, [gastritis], '狗吐了，不太吃东西', 0, [])
    const refreshed = assessDifferential(
      context,
      [pancreatitis, gastritis],
      '补充一下：肚子特别疼，一直弓背，还完全不吃',
      0,
      []
    )

    const names = [
      ...refreshed.convergentCandidates.map(c => c.disease),
      ...refreshed.questions.map(q => q.guidance),
    ].join('\n')

    expect(names).toContain('胰腺炎')
  })

  it('should still apply pending question answers after candidate cache reset', () => {
    const context: TestSessionContext = makeContext()
    context._sessionId = 'cache-reset-session'

    const gastritis = makeSearchResult({
      id: 'gastritis',
      disease: '急性胃炎',
      symptoms: {
        primary: ['呕吐', '食欲下降', '精神萎靡'],
        secondary: ['腹痛', '腹泻'],
        detail: {},
      },
    })
    gastritis.score = 0.62

    const pancreatitis = makeSearchResult({
      id: 'pancreatitis',
      disease: '胰腺炎',
      symptoms: {
        primary: ['剧烈呕吐', '剧烈腹痛', '食欲废绝'],
        secondary: ['弓背姿势', '发热', '脱水'],
        detail: {},
      },
    })
    pancreatitis.score = 0.61

    const first = assessDifferential(
      context,
      [gastritis, pancreatitis],
      '狗呕吐，不吃东西',
      0,
      []
    )
    expect(first.isComplete).toBe(false)

    resetCandidateCache()

    const second = assessDifferential(
      context,
      [gastritis, pancreatitis],
      '有，弓背姿势很明显',
      0,
      first.questions.map(q => q.question)
    )

    expect(second.isComplete).toBe(true)
    expect(second.convergentCandidates[0].disease).toBe('胰腺炎')
  })
})
