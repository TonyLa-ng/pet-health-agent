// ============================================
// MX: Input Compliance Guard Tests
// ============================================

import { describe, it, expect, beforeEach } from 'vitest'
import { guardInput, resetViolationCount } from '../input-guard'

const TEST_SESSION = 'test-session-input-guard'

beforeEach(() => {
  resetViolationCount(TEST_SESSION)
})

describe('PII Masking', () => {
  it('should mask phone number', () => {
    const result = guardInput('我的手机13812341234，狗吐了', TEST_SESSION)
    expect(result.maskedText).not.toContain('13812341234')
    expect(result.maskedText).toContain('138****1234')
    expect(result.piiMatches.length).toBeGreaterThan(0)
    expect(result.piiMatches[0].type).toBe('phone')
  })

  it('should mask ID card number', () => {
    const result = guardInput('身份证310101199001011234，狗生病了', TEST_SESSION)
    expect(result.maskedText).not.toContain('310101199001011234')
    expect(result.maskedText).toContain('310***********1234')
    expect(result.piiMatches.some((m) => m.type === 'id_card')).toBe(true)
  })

  it('should mask Chinese name in human context', () => {
    const result = guardInput('我叫张三，我家狗吐了', TEST_SESSION)
    expect(result.maskedText).not.toContain('张三')
    expect(result.maskedText).toContain('张*')
    expect(result.piiMatches.some((m) => m.type === 'name')).toBe(true)
  })

  it('should NOT mask pet nickname (no human context)', () => {
    const result = guardInput('小白今天吐了两次', TEST_SESSION)
    // "小白" 作为宠物名不应被脱敏（无"我叫/主人是"上下文）
    expect(result.maskedText).toContain('小白')
    const nameMatches = result.piiMatches.filter((m) => m.type === 'name')
    expect(nameMatches).toHaveLength(0)
  })

  it('should mask address', () => {
    const result = guardInput('地址：上海市浦东新区张江路88号3栋201室', TEST_SESSION)
    expect(result.maskedText).toContain('[地址已脱敏]')
    expect(result.piiMatches.some((m) => m.type === 'address')).toBe(true)
  })

  it('should mask implicit address', () => {
    const result = guardInput(
      '我在上海市浦东新区张江路88号，狗不太舒服',
      TEST_SESSION
    )
    expect(result.maskedText).toContain('[地址已脱敏]')
  })
})

describe('Sensitive Word Blocking', () => {
  it('should block euthanasia-related input', () => {
    const result = guardInput('狗安乐死怎么做', TEST_SESSION)
    expect(result.blocked).toBe(true)
    expect(result.violations.length).toBeGreaterThan(0)
    expect(result.violations[0].category).toBe('sensitive_keyword')
  })

  it('should block poisoning-related input', () => {
    const result = guardInput('怎么毒死狗', TEST_SESSION)
    expect(result.blocked).toBe(true)
  })
})

describe('Prescription/Dosage Request Blocking', () => {
  it('should block drug request', () => {
    const result = guardInput('能帮我开点抗生素吗', TEST_SESSION)
    expect(result.blocked).toBe(true)
    expect(
      result.violations.some((v) => v.category === 'prescription_request')
    ).toBe(true)
  })

  it('should block dosage request', () => {
    const result = guardInput('这个药一次吃多少', TEST_SESSION)
    expect(result.blocked).toBe(true)
  })

  it('should block drug recommendation request', () => {
    const result = guardInput('狗吐了该吃什么药', TEST_SESSION)
    expect(result.blocked).toBe(true)
  })
})

describe('Invasive Procedure Blocking', () => {
  it('should block self-surgery suggestion', () => {
    const result = guardInput('我能自己给狗缝伤口吗', TEST_SESSION)
    expect(result.blocked).toBe(true)
    expect(
      result.violations.some((v) => v.category === 'invasive_procedure')
    ).toBe(true)
  })

  it('should block self-injection suggestion', () => {
    const result = guardInput('在家自己注射药物可以吗', TEST_SESSION)
    expect(result.blocked).toBe(true)
  })
})

describe('Folk Remedy Blocking', () => {
  it('should block garlic feeding', () => {
    const result = guardInput('给狗喂大蒜能驱虫吗', TEST_SESSION)
    expect(result.blocked).toBe(true)
    expect(result.violations.some((v) => v.category === 'folk_remedy')).toBe(
      true
    )
  })

  it('should block folk remedy inquiry', () => {
    const result = guardInput('有什么偏方能治狗拉肚子', TEST_SESSION)
    expect(result.blocked).toBe(true)
  })

  it('should block human medicine for pets', () => {
    const result = guardInput('能不能给猫吃人用的藿香正气水', TEST_SESSION)
    expect(result.blocked).toBe(true)
  })
})

describe('Clean Input', () => {
  it('should pass normal symptom description', () => {
    const result = guardInput('狗昨天开始吐了三次，精神不太好', TEST_SESSION)
    expect(result.passed).toBe(true)
    expect(result.blocked).toBe(false)
    expect(result.violations).toHaveLength(0)
  })

  it('should pass normal cat symptom description', () => {
    const result = guardInput('猫最近频繁去猫砂盆，但尿的很少', TEST_SESSION)
    expect(result.passed).toBe(true)
  })
})

describe('Violation Counting', () => {
  it('should count violations across a session', () => {
    // 第 1 次违规
    const r1 = guardInput('能开药吗', TEST_SESSION)
    expect(r1.violationCount).toBeGreaterThanOrEqual(1)

    // 第 2 次违规
    const r2 = guardInput('剂量多少', TEST_SESSION)
    expect(r2.violationCount).toBeGreaterThanOrEqual(2)

    // 第 3 次违规
    const r3 = guardInput('吃什么药好', TEST_SESSION)
    expect(r3.violationCount).toBeGreaterThanOrEqual(3)
  })

  it('should not count violations in normal input', () => {
    const r1 = guardInput('狗吐了', TEST_SESSION)
    expect(r1.violationCount).toBe(0)
  })

  it('should reset violation count', () => {
    guardInput('能开药吗', TEST_SESSION)
    resetViolationCount(TEST_SESSION)
    const r = guardInput('狗吐了', TEST_SESSION)
    expect(r.violationCount).toBe(0)
  })
})

describe('PII + Symptom Coexistence', () => {
  it('should mask PII and still pass normal symptoms', () => {
    const result = guardInput(
      '我的手机13812341234，我家狗昨天开始吐了好几次',
      TEST_SESSION
    )
    // PII 已脱敏
    expect(result.maskedText).not.toContain('13812341234')
    // 症状仍在（"吐"保留）
    expect(result.maskedText).toContain('吐')
    // 不是敏感内容
    expect(result.blocked).toBe(false)
  })
})
