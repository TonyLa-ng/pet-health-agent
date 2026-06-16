// ============================================
// Rules Types — MR 全局禁止规则中心
// ============================================

/** 规则类别 */
export type RuleCategory =
  | 'absolute_statements' // 绝对化表述
  | 'dosage_guidance' // 剂量指导
  | 'prescription_drugs' // 处方药
  | 'invasive_procedures' // 侵入操作
  | 'folk_remedies' // 偏方/民间疗法
  | 'emotional_soothing' // 情绪化安抚
  | 'general_care_forbidden' // 通用护理禁止

/** 规则动作 */
export type RuleAction = 'block_output' | 'block_input' | 'append_to_output'

/** 全局禁止规则 */
export interface ProhibitionRule {
  id: string
  category: RuleCategory
  description: string
  patterns: string[] // 匹配正则/关键词
  action: RuleAction
  severity: 'critical' | 'warning'
  enabled: boolean
}

/** 全局禁止规则集 */
export interface ProhibitionRuleSet {
  version: number
  rules: ProhibitionRule[]
}

/** 规则匹配结果 */
export interface RuleMatchResult {
  ruleId: string
  category: RuleCategory
  matchedText: string
  action: RuleAction
  timestamp: number
}

/** 规则引擎输出 */
export interface RuleEngineOutput {
  passed: boolean
  blocked: boolean
  matches: RuleMatchResult[]
  appendItems: string[] // 需要追加到输出的内容
}

/** 话术库条目 */
export interface PhraseEntry {
  id: string
  category: 'objective_care' | 'boundary_reminder' | 'forbidden'
  text: string
}
