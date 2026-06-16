// ============================================
// MX: Output Compliance Guard
// 免责声明哈希校验 + 禁止规则匹配
// ============================================

import crypto from 'crypto'
import type { OutputComplianceResult, ViolationRecord } from './types'
import { checkOutput } from '@/rules'

/**
 * 免责声明标准文本（唯一合法版本）
 * 不得修改此文本，否则哈希校验不通过
 */
export const DISCLAIMER_TEXT =
  '免责声明：以上内容仅为基于公开兽医知识的初步参考，不能替代执业兽医的当面诊断与检查。若症状持续或加重，请立即前往正规宠物医院就诊。'

/** 免责声明 SHA-256 哈希值 */
export function getDisclaimerHash(): string {
  return crypto.createHash('sha256').update(DISCLAIMER_TEXT, 'utf-8').digest('hex')
}

/**
 * 执行输出合规检查
 *
 * @param outputText - LLM 生成的输出文本
 * @returns OutputComplianceResult
 */
export function guardOutput(outputText: string): OutputComplianceResult {
  const violations: ViolationRecord[] = []
  const now = Date.now()

  // 1. 哈希校验
  const hashCheckEnabled = process.env.HASH_CHECK_ENABLE !== 'false'
  let disclaimerHashMatch = true

  if (hashCheckEnabled) {
    const expectedHashes = loadAllowedHashes()
    const outputHash = extractAndHashDisclaimer(outputText)

    if (outputHash) {
      disclaimerHashMatch = expectedHashes.includes(outputHash)
      if (!disclaimerHashMatch) {
        violations.push({
          ruleName: 'disclaimer_hash',
          matchedText: '免责声明内容被修改',
          timestamp: now,
          category: 'other',
        })
      }
    } else {
      // 输出中未找到免责声明
      disclaimerHashMatch = false
      violations.push({
        ruleName: 'disclaimer_missing',
        matchedText: '输出中缺少免责声明',
        timestamp: now,
        category: 'other',
      })
    }
  }

  // 2. 禁止规则匹配（MR 规则中心）
  const ruleResult = checkOutput(outputText)

  for (const match of ruleResult.matches) {
    violations.push({
      ruleName: match.ruleId,
      matchedText: match.matchedText,
      timestamp: now,
      category: mapRuleCategory(match.category),
    })
  }

  const blocked = !disclaimerHashMatch || ruleResult.blocked

  return {
    passed: !blocked,
    blocked,
    violations,
    disclaimerHashMatch,
    hashCheckEnabled,
  }
}

/**
 * 从输出文本中提取免责声明并计算哈希
 */
function extractAndHashDisclaimer(text: string): string | null {
  // 从"免责声明"取到文本末尾（或下一个分隔符）
  const startIdx = text.indexOf('免责声明')
  if (startIdx === -1) return null

  let endIdx = text.indexOf('\n---', startIdx)
  if (endIdx === -1) endIdx = text.length

  const extracted = text.slice(startIdx, endIdx).trim()
  if (extracted.length < 20) return null

  return crypto.createHash('sha256').update(extracted, 'utf-8').digest('hex')
}

/**
 * 加载允许的免责声明哈希白名单
 */
function loadAllowedHashes(): string[] {
  try {
    const hashesStr = process.env.DISCLAIMER_HASHES
    if (hashesStr) {
      const parsed = JSON.parse(hashesStr)
      if (Array.isArray(parsed)) {
        return parsed.map((h) => h.replace('sha256:', ''))
      }
    }
  } catch {
    // 解析失败，使用默认哈希
  }

  // 默认：只允许当前标准文本的哈希
  return [getDisclaimerHash()]
}

/** RuleCategory → ViolationCategory 映射 */
function mapRuleCategory(cat: string): import('./types').ViolationCategory {
  const map: Record<string, import('./types').ViolationCategory> = {
    absolute_statements: 'absolute_statement',
    dosage_guidance: 'dosage_request',
    prescription_drugs: 'prescription_request',
    invasive_procedures: 'invasive_procedure',
    folk_remedies: 'folk_remedy',
    emotional_soothing: 'emotional_soothing',
    general_care_forbidden: 'other',
  }
  return map[cat] || 'other'
}

/**
 * 检查输出是否包含有效的免责声明（简化版，MVP 用）
 * 不依赖哈希，仅检查文本片段是否完整
 */
export function hasValidDisclaimer(text: string): boolean {
  const requiredParts = [
    '免责声明',
    '不能替代执业兽医',
    '当面诊断',
    '正规宠物医院',
  ]

  return requiredParts.every((part) => text.includes(part))
}
