// ============================================
// M3: Symptom Normalizer Tests
// ============================================

import { describe, it, expect } from 'vitest'
import { normalize } from '../normalizer'

describe('Normalizer - Noise Filtering (Layer 0)', () => {
  it('should filter greeting noise', () => {
    const result = normalize('你好，我家狗吐了', '犬')
    expect(result.chiefComplaint.some((s) => s.name === '呕吐')).toBe(true)
    expect(result.excludedNoise.length).toBeGreaterThan(0)
  })

  it('should filter emoji noise', () => {
    const result = normalize('猫不吃东西了😂😭怎么办', '猫')
    expect(result.chiefComplaint.some((s) => s.name === '食欲下降')).toBe(true)
  })

  it('should filter pet-owner expressions', () => {
    const result = normalize('我家狗狗今天吐了两次', '犬')
    expect(result.chiefComplaint.some((s) => s.name === '呕吐')).toBe(true)
  })
})

describe('Normalizer - Typo Correction (Layer 0)', () => {
  it('should correct "窜希" to "腹泻"', () => {
    const result = normalize('狗窜希了', '犬')
    expect(result.chiefComplaint.some((s) => s.name === '腹泻')).toBe(true)
  })

  it('should correct "欧吐" to "呕吐"', () => {
    const result = normalize('猫欧吐了', '猫')
    expect(result.chiefComplaint.some((s) => s.name === '呕吐')).toBe(true)
  })
})

describe('Normalizer - Synonym Replacement (Layer 1)', () => {
  it('should normalize "窜稀" → "腹泻"', () => {
    const result = normalize('我家狗子窜稀了', '犬')
    expect(result.chiefComplaint.some((s) => s.name === '腹泻')).toBe(true)
  })

  it('should normalize "吐了" → "呕吐"', () => {
    const result = normalize('狗吐了两次', '犬')
    expect(result.chiefComplaint.some((s) => s.name === '呕吐')).toBe(true)
  })

  it('should normalize "没精神" → "精神萎靡"', () => {
    const result = normalize('猫没精神，不爱动', '猫')
    expect(
      result.chiefComplaint.some((s) => s.name === '精神萎靡') ||
        result.accompanyingSymptoms.some((s) => s.name === '精神萎靡')
    ).toBe(true)
  })

  it('should not normalize explicitly negated symptoms as positive', () => {
    const result = normalize('狗拉肚子，暂时没有血便，也没有发热，没有呕吐，但没精神', '犬')
    const allSymptoms = [
      ...result.chiefComplaint.map((s) => s.name),
      ...result.accompanyingSymptoms.map((s) => s.name),
    ]

    expect(allSymptoms).toContain('腹泻')
    expect(allSymptoms).toContain('精神萎靡')
    expect(allSymptoms).not.toContain('排便带血')
    expect(allSymptoms).not.toContain('发热')
    expect(allSymptoms).not.toContain('呕吐')
  })

  it('should normalize cat-specific "乱尿"', () => {
    const result = normalize('猫最近乱尿，不在猫砂盆尿', '猫')
    const hasLuanNiao =
      result.chiefComplaint.some((s) => s.name === '乱尿') ||
      result.accompanyingSymptoms.some((s) => s.name === '乱尿')
    expect(hasLuanNiao).toBe(true)
  })

  it('should normalize multiple symptoms together', () => {
    const result = normalize('猫吐了，也不吃东西，精神不好，一直躲着', '猫')
    const allSymptoms = [
      ...result.chiefComplaint.map((s) => s.name),
      ...result.accompanyingSymptoms.map((s) => s.name),
    ]
    expect(allSymptoms).toContain('呕吐')
    expect(allSymptoms).toContain('食欲下降')
    expect(allSymptoms).toContain('精神萎靡')
    expect(allSymptoms).toContain('躲藏行为')
  })

  it('should not invent unrelated symptoms from loose character-order matches', () => {
    const result = normalize('有，弓背姿势很明显，肚子疼得厉害，昨天吃了肥肉，完全不吃', '犬')
    const allSymptoms = [
      ...result.chiefComplaint.map((s) => s.name),
      ...result.accompanyingSymptoms.map((s) => s.name),
    ]

    expect(allSymptoms).toContain('腹痛')
    expect(allSymptoms).toContain('食欲下降')
    expect(allSymptoms).not.toContain('腹泻')
    expect(allSymptoms).not.toContain('咳嗽')
    expect(allSymptoms).not.toContain('瘙痒')
    expect(allSymptoms).not.toContain('张口呼吸')
  })
})

describe('Normalizer - Symptom Classification (Layer 2)', () => {
  it('should classify vomiting as chief complaint', () => {
    const result = normalize('狗吐了，有点没精神', '犬')
    expect(result.chiefComplaint.some((s) => s.name === '呕吐')).toBe(true)
    expect(result.chiefComplaint.length).toBeGreaterThan(0)
  })

  it('should classify accompanying symptoms correctly', () => {
    const result = normalize(
      '狗吐了，也不吃东西，精神萎靡，还有点拉稀',
      '犬'
    )
    // 呕吐 → chief
    // 食欲下降 → chief
    // 精神萎靡 → chief
    // 腹泻 → chief (all are in CHIEF_SYMPTOM_TYPES)
    expect(result.chiefComplaint.length).toBeGreaterThan(0)
    // All four symptoms are in CHIEF_SYMPTOM_TYPES → all should be chief
    expect(result.chiefComplaint.length).toBeGreaterThanOrEqual(3)
  })

  it('should set correct symptom category', () => {
    const result = normalize('狗吐了', '犬')
    for (const s of result.chiefComplaint) {
      expect(s.category).toBe('chief')
    }
    for (const s of result.accompanyingSymptoms) {
      expect(s.category).toBe('accompanying')
    }
  })
})

describe('Normalizer - Vital Signs Extraction', () => {
  it('should extract temperature when present', () => {
    const result = normalize('狗发烧了，体温39.8度', '犬')
    expect(result.vitalSigns.length).toBeGreaterThan(0)
    const temp = result.vitalSigns.find((v) => v.type === 'temperature')
    expect(temp).toBeDefined()
    expect(temp!.value).toBe(39.8)
    // 犬正常体温 37.5-39.2, 39.8 > 39.2 → abnormal
    expect(temp!.isAbnormal).toBe(true)
  })

  it('should mark normal temperature correctly', () => {
    const result = normalize('狗体温38.2度', '犬')
    const temp = result.vitalSigns.find((v) => v.type === 'temperature')
    expect(temp).toBeDefined()
    expect(temp!.value).toBe(38.2)
    // 犬正常 37.5-39.2, 38.2 is within range → not abnormal
    expect(temp!.isAbnormal).toBe(false)
  })

  it('should handle cat temperature with cat ranges', () => {
    const result = normalize('猫发烧了，39.8度', '猫')
    const temp = result.vitalSigns.find((v) => v.type === 'temperature')
    expect(temp).toBeDefined()
    // 猫正常 37.8-39.5, 39.8 > 39.5 → abnormal
    expect(temp!.isAbnormal).toBe(true)
  })
})

describe('Normalizer - Timeline Building', () => {
  it('should detect continuous pattern', () => {
    const result = normalize('狗一直咳嗽不停', '犬')
    expect(result.timeline.pattern).toBe('continuous')
    expect(result.timeline.frequency).toBe('持续')
  })

  it('should detect intermittent pattern', () => {
    const result = normalize('猫有时候吐，一阵一阵的', '猫')
    expect(result.timeline.pattern).toBe('intermittent')
  })

  it('should detect paroxysmal pattern', () => {
    const result = normalize('狗突然一下子抽搐了', '犬')
    expect(result.timeline.pattern).toBe('paroxysmal')
  })

  it('should extract onset description', () => {
    const result = normalize('狗从昨天开始一直吐', '犬')
    expect(result.timeline.onset).toContain('昨天')
  })

  it('should default to unknown pattern for simple input', () => {
    const result = normalize('狗吐了', '犬')
    expect(result.timeline.pattern).toBe('unknown')
  })
})

describe('Normalizer - Environment Factors', () => {
  it('should detect recent food change', () => {
    const result = normalize('狗换了新狗粮之后开始吐', '犬')
    expect(result.environmentFactors).toContain('近期换粮')
  })

  it('should detect eating inappropriate food', () => {
    const result = normalize('狗吃了垃圾桶里的剩饭', '犬')
    expect(result.environmentFactors).toContain('进食非常规食物')
    expect(result.environmentFactors).toContain('翻垃圾桶')
  })

  it('should detect moving/new environment', () => {
    const result = normalize('猫搬家之后开始不吃东西', '猫')
    expect(result.environmentFactors).toContain('环境变化（搬家）')
  })

  it('should return empty array when no environmental factors detected', () => {
    const result = normalize('狗吐了', '犬')
    expect(result.environmentFactors).toEqual([])
  })
})

describe('Normalizer - Integration', () => {
  it('should fully normalize a complex real-world input', () => {
    const result = normalize(
      '你好，我家金毛狗狗昨天开始一直吐，吐了三四次了，也不吃东西，精神特别差，还拉稀，体温量了一下39.5度，感觉最近好像换了狗粮之后就这样了',
      '犬'
    )

    // Chief complaints
    expect(result.chiefComplaint.some((s) => s.name === '呕吐')).toBe(true)
    expect(result.chiefComplaint.some((s) => s.name === '食欲下降')).toBe(true)
    expect(result.chiefComplaint.some((s) => s.name === '精神萎靡')).toBe(true)
    expect(result.chiefComplaint.some((s) => s.name === '腹泻')).toBe(true)

    // Vital signs
    expect(result.vitalSigns.length).toBeGreaterThan(0)
    const temp = result.vitalSigns.find((v) => v.type === 'temperature')
    expect(temp?.value).toBe(39.5)
    expect(temp?.isAbnormal).toBe(true) // 39.5 > 39.2

    // Timeline
    expect(result.timeline.pattern).toBe('continuous')
    expect(result.timeline.onset).toContain('昨天')

    // Environment
    expect(result.environmentFactors).toContain('近期换粮')

    // Noise excluded
    expect(result.excludedNoise.length).toBeGreaterThan(0)
  })

  it('should produce non-empty chiefComplaint for valid input', () => {
    const result = normalize('狗吐了', '犬')
    // M3.normalize() 返回非空 chiefComplaint → 视为「采集完成」
    expect(result.chiefComplaint.length).toBeGreaterThan(0)
  })

  it('should return empty chiefComplaint for non-medical text', () => {
    const result = normalize('今天天气真好', '犬')
    expect(result.chiefComplaint).toEqual([])
    expect(result.accompanyingSymptoms).toEqual([])
  })
})
