// ============================================
// MR: Global Prohibition Rules Center
// 全局禁止规则中心 — 所有模块统一引用此数据源
// ============================================

import fs from 'fs'
import path from 'path'
import type { ProhibitionRuleSet, ProhibitionRule, RuleMatchResult, RuleEngineOutput } from './types'
import type { RuleCategory, RuleAction } from './types'

type AppendableRule = ProhibitionRuleSet['rules'][number] & {
  appendContent?: string[]
}

/** 加载规则集 */
export function loadRules(): ProhibitionRuleSet {
  const filePath = path.resolve(process.cwd(), 'src', 'rules', 'rules.json')
  const raw = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as ProhibitionRuleSet
}

/**
 * 匹配文本中是否包含禁止规则
 * @returns 匹配到的规则列表
 */
export function matchRules(text: string, scope: 'output' | 'input'): RuleMatchResult[] {
  const ruleSet = loadRules()
  const results: RuleMatchResult[] = []

  for (const rule of ruleSet.rules) {
    if (!rule.enabled) continue

    // output 规则不在 input 侧检查，反之亦然
    const isOutputRule = rule.action === 'block_output' || rule.action === 'append_to_output'
    const isInputRule = rule.action === 'block_input'

    if (scope === 'output' && !isOutputRule) continue
    if (scope === 'input' && !isInputRule) continue

    for (const pattern of rule.patterns) {
      try {
        const regex = new RegExp(pattern, 'i')
        const match = text.match(regex)
        if (match) {
          results.push({
            ruleId: rule.id,
            category: rule.category,
            matchedText: match[0],
            action: rule.action,
            timestamp: Date.now(),
          })
          break // 该规则只记录一次
        }
      } catch {
        // 非正则 pattern，做字符串包含匹配
        if (text.includes(pattern)) {
          results.push({
            ruleId: rule.id,
            category: rule.category,
            matchedText: pattern,
            action: rule.action,
            timestamp: Date.now(),
          })
          break
        }
      }
    }
  }

  return results
}

/**
 * 执行完整规则引擎检查
 */
export function checkOutput(text: string): RuleEngineOutput {
  const matches = matchRules(text, 'output')

  const blocked = matches.some((m) => m.action === 'block_output')
  const blockMatches = matches.filter((m) => m.action === 'block_output')

  // 收集 append_to_output 的内容
  const ruleSet = loadRules()
  const appendItems: string[] = []
  for (const rule of ruleSet.rules) {
    const appendContent = (rule as AppendableRule).appendContent
    if (rule.action === 'append_to_output' && rule.enabled && appendContent) {
      appendItems.push(...appendContent)
    }
  }

  return {
    passed: !blocked,
    blocked,
    matches: blockMatches,
    appendItems,
  }
}

/** 获取需要追加到输出的禁止事项 */
export function getAppendItems(): string[] {
  const ruleSet = loadRules()
  const items: string[] = []
  for (const rule of ruleSet.rules) {
    const appendContent = (rule as AppendableRule).appendContent
    if (rule.action === 'append_to_output' && rule.enabled && appendContent) {
      items.push(...appendContent)
    }
  }
  return items
}

/**
 * 检查输入是否命中敏感规则（用于输入侧拦截）
 */
export function checkInput(text: string): { blocked: boolean; matches: RuleMatchResult[] } {
  const matches = matchRules(text, 'input')
  return {
    blocked: matches.length > 0,
    matches,
  }
}
