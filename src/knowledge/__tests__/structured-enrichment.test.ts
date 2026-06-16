import { describe, expect, it } from 'vitest'
import { loadAllKnowledge } from '../loader'

describe('Structured knowledge enrichment', () => {
  it('enriches every active knowledge entry with global interview and report fields', () => {
    const entries = [...loadAllKnowledge('犬'), ...loadAllKnowledge('猫')]
    expect(entries.length).toBeGreaterThan(20)

    for (const entry of entries) {
      expect(entry.category_path?.length, entry.id).toBeGreaterThanOrEqual(2)
      expect(entry.entry_symptoms?.length, entry.id).toBeGreaterThan(0)
      expect(entry.key_symptoms?.length, entry.id).toBeGreaterThan(0)
      expect(entry.rule_out?.length, entry.id).toBeGreaterThan(0)
      expect(entry.severity_stages?.length, entry.id).toBeGreaterThan(0)
      expect(entry.required_tests?.length, entry.id).toBeGreaterThan(0)
      expect(entry.emergency_signs?.length, entry.id).toBeGreaterThan(0)
      expect(entry.report_profile?.forbidden?.length, entry.id).toBeGreaterThan(0)
    }
  })

  it('adds a detailed parvovirus decision structure from professional veterinary references', () => {
    const parvo = loadAllKnowledge('犬').find((entry) => entry.id === 'canine-inf-001')

    expect(parvo).toBeDefined()
    expect(parvo!.category_path).toEqual(expect.arrayContaining(['传染病', '消化道传染病']))
    expect(parvo!.risk_factors?.map((factor) => factor.factor).join('\n')).toMatch(/月龄|疫苗|接触史/)
    expect(parvo!.rule_in?.map((rule) => rule.evidence).join('\n')).toMatch(/番茄|腥臭|脱水|白细胞/)
    expect(parvo!.rule_out?.map((rule) => rule.evidence).join('\n')).toMatch(/完成.*免疫|无血便|无腥臭/)
    expect(parvo!.severity_stages?.map((stage) => `${stage.stage}:${stage.signs.join('、')}`).join('\n')).toMatch(/潜伏期|前驱期|症状爆发期|危重衰竭期|心肌炎型/)
    expect(parvo!.required_tests?.map((item) => item.test).join('\n')).toMatch(/CPV|PCR|血常规|电解质/)
    expect(parvo!.report_profile?.forbidden.join('\n')).toMatch(/止泻药|大量饮水|居家观察/)
  })
})
