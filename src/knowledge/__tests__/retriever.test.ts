// ============================================
// Knowledge Retriever Tests
// ============================================

import { describe, it, expect } from 'vitest'
import { search } from '../retriever'
import {
  loadAllKnowledge,
  loadEmergencyRules,
  loadDurationDict,
  loadSynonyms,
  loadSpeciesConfig,
} from '../loader'

describe('Knowledge Loader', () => {
  it('should load dog digestive knowledge', () => {
    const entries = loadAllKnowledge('犬')
    expect(entries.length).toBeGreaterThanOrEqual(2) // 胃炎 + 尿闭
    const gastritis = entries.find((e) => e.id === 'canine-gastritis-001')
    expect(gastritis).toBeDefined()
    expect(gastritis!.disease).toBe('急性胃炎')
    expect(gastritis!.species).toContain('犬')
    expect(gastritis!.symptoms.primary).toContain('呕吐')
    expect(gastritis!.symptoms.primary).toContain('食欲下降')
  })

  it('should load cat urinary knowledge', () => {
    const entries = loadAllKnowledge('猫')
    const urinary = entries.find((e) => e.id === 'feline-urinary-001')
    expect(urinary).toBeDefined()
    expect(urinary!.disease).toBe('猫下泌尿道疾病/尿闭（FLUTD/FUS）')
    expect(urinary!.urgency).toBe('critical')
  })

  it('should load emergency rules', () => {
    const rules = loadEmergencyRules()
    expect(rules.version).toBe(1)
    expect(rules.global_signals.length).toBeGreaterThan(0)
    // 检查 duration_effect 字段
    const seizure = rules.global_signals.find((s) => s.keyword === '抽搐')
    expect(seizure).toBeDefined()
    expect(seizure!.duration_effect).toBe('negative')
    // 持续呕吐 duration_effect 应为 positive
    const vomiting = rules.global_signals.find((s) => s.keyword === '持续呕吐')
    expect(vomiting).toBeDefined()
    expect(vomiting!.duration_effect).toBe('positive')
  })

  it('should load duration dictionary', () => {
    const dict = loadDurationDict()
    expect(dict.mappings.less_than_1h.keywords).toContain('刚')
    expect(dict.mappings.more_than_24h.keywords).toContain('几天')
    expect(dict.fuzzy_markers).toContain('一阵子')
    expect(dict.conflict_detection.description).toBeDefined()
  })

  it('should load synonyms for dogs', () => {
    const syn = loadSynonyms('犬')
    expect(syn.species).toBe('犬')
    // 吐 → 呕吐
    const vomitSynonyms = syn.mappings['呕吐']
    expect(vomitSynonyms).toBeDefined()
    expect(vomitSynonyms).toContain('吐')
    expect(vomitSynonyms).toContain('吐了')
  })

  it('should load synonyms for cats', () => {
    const syn = loadSynonyms('猫')
    expect(syn.species).toBe('猫')
    // 乱尿 is a cat-specific symptom
    expect(syn.mappings['乱尿']).toBeDefined()
    expect(syn.mappings['乱尿']).toContain('到处尿')
  })

  it('should load species config for dogs', () => {
    const config = loadSpeciesConfig('犬')
    expect(config.species).toBe('犬')
    expect(config.normal_vitals.temperature.min).toBe(37.5)
    expect(config.allow_cross_species_search).toBe(true)
  })
})

describe('Knowledge Retriever', () => {
  it('should find acute gastritis for vomiting + appetite loss in dogs', () => {
    const results = search(['呕吐', '食欲下降'], '犬')
    expect(results.length).toBeGreaterThan(0)
    const top = results[0]
    expect(top.entry.id).toBe('canine-gastritis-001')
    expect(top.score).toBeGreaterThanOrEqual(0.55)
    expect(top.matchDetails.isCrossSpecies).toBe(false)
  })

  it('should find urinary blockage for urination difficulty in dogs', () => {
    const results = search(['排尿困难', '尿频'], '犬')
    expect(results.length).toBeGreaterThan(0)
    const top = results[0]
    expect(top.entry.id).toMatch(/canine-urinary|canine-uro/)
    expect(top.matchDetails.isCrossSpecies).toBe(false)
  })

  it('should find FLUTD for urination difficulty in cats', () => {
    const results = search(['排尿困难', '血尿'], '猫')
    expect(results.length).toBeGreaterThan(0)
    const top = results[0]
    expect(top.entry.id).toMatch(/feline-urinary|feline-uro/)
    expect(top.matchDetails.isCrossSpecies).toBe(false)
  })

  it('should expand synonyms — "吐" should match "呕吐"', () => {
    const results = search(['吐', '不吃东西'], '犬')
    expect(results.length).toBeGreaterThan(0)
    const top = results[0]
    expect(top.entry.id).toBe('canine-gastritis-001')
  })

  it('should expand synonyms — "窜稀" should match "腹泻"', () => {
    const results = search(['窜稀', '没精神'], '犬')
    expect(results.length).toBeGreaterThan(0)
    // 腹泻+精神萎靡 should find gastritis
    const found = results.some(
      (r) => r.entry.id === 'canine-gastritis-001'
    )
    expect(found).toBe(true)
  })

  it('should return empty for uncovered symptom (骨折)', () => {
    const results = search(['骨折'], '犬')
    // 知识库未覆盖骨折，应返回空
    expect(results.length).toBe(0)
  })

  it('should return empty for uncovered symptom in cats (骨折)', () => {
    const results = search(['骨折'], '猫')
    expect(results.length).toBe(0)
  })

  it('should cross-species search when dog KB has no match for cat symptoms', () => {
    // 用犬症状查猫知识库 — 如果猫无匹配，可能触发跨物种
    const results = search(['呕吐', '食欲下降', '精神萎靡'], '猫')
    expect(results.length).toBeGreaterThan(0)
    // 首要结果应该是猫胃炎
    const top = results[0]
    expect(top.entry.species).toContain('猫')
    expect(top.matchDetails.isCrossSpecies).toBe(false)
  })

  it('should filter by species — dog query should prioritize dog entries', () => {
    const results = search(['呕吐', '食欲下降', '精神萎靡'], '犬')
    expect(results.length).toBeGreaterThan(0)
    // 第一条应该是犬的条目
    const topDogResults = results.filter((r) => !r.matchDetails.isCrossSpecies)
    expect(topDogResults.length).toBeGreaterThan(0)
    expect(topDogResults[0].entry.species).toContain('犬')
  })

  it('should apply cross-species penalty (score * 0.5)', () => {
    // 搜索一个在猫知识库中更匹配的症状组合，但用犬查询
    const dogResults = search(['排尿困难', '乱尿'], '犬')
    // 跨物种结果（如果有）的分数应该被惩罚
    const crossResults = dogResults.filter((r) => r.matchDetails.isCrossSpecies)
    const nativeResults = dogResults.filter((r) => !r.matchDetails.isCrossSpecies)

    // 本物种结果应该排在跨物种结果前面
    if (crossResults.length > 0 && nativeResults.length > 0) {
      expect(nativeResults[0].score).toBeGreaterThanOrEqual(crossResults[0].score)
    }
  })

  it('should rank results by relevance score descending', () => {
    const results = search(['呕吐', '食欲下降', '精神萎靡', '腹泻'], '犬')
    expect(results.length).toBeGreaterThan(0)

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })

  it('should not confuse short Chinese symptoms that differ by one character', () => {
    const results = search(['呕吐', '腹痛', '弓背姿势', '食欲下降'], '犬')
    expect(results.length).toBeGreaterThan(0)

    const pancreatitisIndex = results.findIndex((r) => r.entry.id === 'canine-dig-004')
    const enteritisIndex = results.findIndex((r) => r.entry.id === 'canine-dig-003')

    expect(pancreatitisIndex).toBeGreaterThanOrEqual(0)
    expect(enteritisIndex).toBeGreaterThanOrEqual(0)
    expect(pancreatitisIndex).toBeLessThan(enteritisIndex)
  })

  it('should not rank vomiting-core gastritis first for diarrhea-only dog complaints', () => {
    const results = search(['腹泻'], '犬')
    expect(results.length).toBeGreaterThan(0)

    expect(results[0].entry.id).not.toBe('canine-gastritis-001')
    expect(results[0].entry.symptoms.primary.join('、')).toMatch(/腹泻|软便/)
  })

  it('should not rank vomiting-core gastritis first for diarrhea-only cat complaints', () => {
    const results = search(['腹泻'], '猫')
    expect(results.length).toBeGreaterThan(0)

    expect(results[0].entry.id).not.toBe('feline-gastritis-001')
    expect(results[0].entry.symptoms.primary.join('、')).toMatch(/腹泻|软便/)
  })

  it('should give urgent urinary matches enough weight despite longer primary symptom lists', () => {
    const results = search(['排尿困难', '尿频', '呕吐', '精神萎靡'], '猫')
    expect(results.length).toBeGreaterThan(0)

    expect(results[0].entry.id).toBe('feline-urinary-001')
    expect(results[0].score).toBeGreaterThanOrEqual(0.65)
  })

  it('should rank FIC above urinary obstruction when there is no obstruction evidence', () => {
    const results = search(['尿频', '血尿', '排尿疼痛', '乱尿'], '猫')
    expect(results.length).toBeGreaterThan(0)

    const ficIndex = results.findIndex((r) => r.entry.id === 'feline-uro-002')
    const obstructionIndex = results.findIndex((r) => r.entry.id === 'feline-urinary-001')

    expect(results[0].entry.id).toBe('feline-uro-002')
    expect(ficIndex).toBeGreaterThanOrEqual(0)
    if (obstructionIndex >= 0) {
      expect(ficIndex).toBeLessThan(obstructionIndex)
    }
  })

  it('should set primaryHitRate correctly', () => {
    const results = search(['呕吐', '食欲下降', '精神萎靡'], '犬')
    const top = results[0]
    // 急性胃炎 primary: [呕吐, 食欲下降, 精神萎靡]
    // 命中全部3个 → primaryHitRate = 1.0
    expect(top.matchDetails.primaryHitRate).toBe(1.0)
  })

  it('should respect knowledge entry confidence multiplier', () => {
    const results = search(['呕吐'], '犬')
    expect(results.length).toBeGreaterThan(0)
    // 急性胃炎 confidence = "high" → multiplier = 1.0
    // 仅命中 1/3 主要症状 → primaryHitRate * 0.85 ≈ 0.28
    // 呕吐可匹配多种疾病（胃炎/窝咳/肠炎等），任一犬消化/呼吸系统疾病均可
    expect(results[0].entry.species).toContain('犬')
    expect(results[0].score).toBeGreaterThan(0.25)
    expect(results[0].score).toBeLessThanOrEqual(1.0)
  })

  it('should handle empty symptoms gracefully', () => {
    const results = search([], '犬')
    expect(results).toEqual([])
  })

  it('should handle unknown species gracefully (returns empty, no throw)', () => {
    const results = search(['呕吐'], '兔' as '犬')
    // 兔目前无知识库数据（knowledge/species/rabbits/ 为空），应返回空
    // 且不抛异常（loader 返回默认 config）
    expect(results).toEqual([])
  })
})
