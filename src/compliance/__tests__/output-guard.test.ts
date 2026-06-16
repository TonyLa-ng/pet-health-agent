// ============================================
// MX: Output Compliance Guard Tests
// ============================================

import { describe, it, expect } from 'vitest'
import { guardOutput, DISCLAIMER_TEXT, getDisclaimerHash, hasValidDisclaimer } from '../output-guard'

describe('Disclaimer', () => {
  it('should compute consistent hash for standard disclaimer', () => {
    const hash1 = getDisclaimerHash()
    const hash2 = getDisclaimerHash()
    expect(hash1).toBe(hash2)
    expect(hash1.length).toBe(64) // SHA-256 = 64 hex chars
  })

  it('should detect valid disclaimer in output', () => {
    const output = `【诊断报告】\n狗可能患有急性胃炎。\n\n${DISCLAIMER_TEXT}`
    expect(hasValidDisclaimer(output)).toBe(true)
  })

  it('should detect missing disclaimer', () => {
    const output = '【诊断报告】\n狗可能患有急性胃炎。\n\n以上仅供参考。'
    expect(hasValidDisclaimer(output)).toBe(false)
  })

  it('should detect modified disclaimer', () => {
    const output = `【诊断报告】\n狗可能患有急性胃炎。\n\n免责声明：以上内容仅供参考，不构成医疗建议。`
    // "不能替代执业兽医" 和 "正规宠物医院" 缺失
    expect(hasValidDisclaimer(output)).toBe(false)
  })
})

describe('Output Prohibition Rules', () => {
  it('should block absolute statements', () => {
    const result = guardOutput(`你家狗肯定是急性胃炎。\n\n${DISCLAIMER_TEXT}`)
    expect(result.blocked).toBe(true)
    expect(result.violations.some((v) => v.ruleName === 'R001')).toBe(true)
  })

  it('should block dosage guidance', () => {
    const result = guardOutput(
      `建议使用阿莫西林，用量10mg/kg，每天两次。\n\n${DISCLAIMER_TEXT}`
    )
    expect(result.blocked).toBe(true)
    expect(result.violations.some((v) => v.ruleName === 'R002')).toBe(true)
  })

  it('should block prescription drug suggestion', () => {
    const result = guardOutput(
      `可以给宠物使用抗生素和激素治疗。\n\n${DISCLAIMER_TEXT}`
    )
    expect(result.blocked).toBe(true)
    expect(result.violations.some((v) => v.ruleName === 'R003')).toBe(true)
  })

  it('should block invasive procedure suggestion', () => {
    const result = guardOutput(
      `建议在家自行给宠物注射药物。\n\n${DISCLAIMER_TEXT}`
    )
    expect(result.blocked).toBe(true)
    expect(result.violations.some((v) => v.ruleName === 'R004')).toBe(true)
  })

  it('should block folk remedy suggestions', () => {
    const result = guardOutput(
      `可以试试偏方，用大蒜喂。\n\n${DISCLAIMER_TEXT}`
    )
    expect(result.blocked).toBe(true)
  })

  it('should block emotional soothing phrases', () => {
    const result = guardOutput(
      `别担心，没事的，狗肯定会好起来的。\n\n${DISCLAIMER_TEXT}`
    )
    expect(result.blocked).toBe(true)
    expect(result.violations.some((v) => v.ruleName === 'R006')).toBe(true)
  })
})

describe('Clean Output', () => {
  it('should pass valid diagnosis output', () => {
    const output = `【宠物基础信息】
品种：金毛  年龄：3岁  体重：25kg

【本次症状梳理】
呕吐、食欲下降、精神萎靡，持续一天。

【初步判断】
1. 急性胃炎  置信度：85%  🟢
   支持依据：呕吐+食欲下降+精神萎靡与急性胃炎高度吻合。
   不支持依据：无血便、无高烧。

【居家护理建议】
可做：短期禁食12-24小时，少量多餐恢复进食。
禁止：- 禁止使用人用药物
- 禁止自行灌药（除非兽医指导）

${DISCLAIMER_TEXT}`

    const result = guardOutput(output)
    expect(result.passed).toBe(true)
    expect(result.blocked).toBe(false)
  })
})

describe('Missing Disclaimer Detection', () => {
  it('should flag output without disclaimer', () => {
    const output = '【诊断报告】\n狗可能患有急性胃炎，建议前往宠物医院就诊。'
    const result = guardOutput(output)
    expect(result.violations.some((v) => v.ruleName === 'disclaimer_missing')).toBe(true)
  })
})
