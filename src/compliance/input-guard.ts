// ============================================
// MX: Input Compliance Guard
// PII 脱敏 + 敏感词拦截 + 违规计数
// 执行顺序（不可颠倒）：脱敏 → 症状归一化 → 急症检测
// ============================================

import fs from 'fs'
import path from 'path'
import type { InputComplianceResult, PIIMatch, ViolationRecord, ViolationCategory } from './types'

/** 合规词库条目 */
interface ComplianceWordList {
  version: number
  category: string
  description: string
  keywords: string[]
  patterns: string[]
  action: string
  response: string
}

/** 会话违规计数器（内存存储，MVP 阶段） */
const violationCounters = new Map<string, number>()

/**
 * 执行输入合规检查
 *
 * @param text - 用户原始输入
 * @param sessionId - 会话 ID（用于违规计数）
 * @returns InputComplianceResult
 */
export function guardInput(text: string, sessionId: string): InputComplianceResult {
  // Step 1: PII 脱敏
  const { maskedText, piiMatches } = maskPII(text)

  // Step 2: 敏感词/违规请求检测
  const violations = detectViolations(text)
    .filter((violation) => !isSafetySeekingToxicExposure(text, violation))

  // Step 3: 违规计数
  if (violations.length > 0) {
    const count = (violationCounters.get(sessionId) || 0) + violations.length
    violationCounters.set(sessionId, count)
  }
  const currentCount = violationCounters.get(sessionId) || 0

  // Step 4: 判定是否拦截（敏感词/侵入操作/偏方 → 直接拦截；求药 → 拦截）
  const blocked = violations.some(
    (v) =>
      v.category === 'sensitive_keyword' ||
      v.category === 'invasive_procedure' ||
      v.category === 'folk_remedy' ||
      v.category === 'prescription_request'
  )

  return {
    passed: !blocked,
    blocked,
    maskedText,
    violations,
    piiMatches,
    violationCount: currentCount,
  }
}

/**
 * 重置会话违规计数
 */
export function resetViolationCount(sessionId: string): void {
  violationCounters.delete(sessionId)
}

/**
 * PII 脱敏
 *
 * 规则（v3.1 修订）：
 * - 手机号：保留前 3 位
 * - 身份证：保留前 3 后 4
 * - 中文姓名：仅人类称呼上下文（"我叫""主人是"），纯宠物昵称跳过
 * - 地址：整体替换为 [地址已脱敏]
 */
function maskPII(text: string): { maskedText: string; piiMatches: PIIMatch[] } {
  const matches: PIIMatch[] = []
  let masked = text

  // 1. 身份证 — 先处理（17位数字+X/x，避免被手机号误匹配）
  const idRegex = /\d{17}[\dXx]/g
  let idMatch: RegExpExecArray | null
  while ((idMatch = idRegex.exec(text)) !== null) {
    const original = idMatch[0]
    const masked_id = original.slice(0, 3) + '***********' + original.slice(-4)
    matches.push({
      type: 'id_card',
      original,
      masked: masked_id,
      position: [idMatch.index, idMatch.index + original.length],
    })
    masked = masked.replace(original, masked_id)
  }

  // 2. 手机号 — 1[3-9]xxxxxxxxx（在已脱敏文本上匹配，避免误匹配身份证尾段）
  const phoneRegex = /(?<!\d)1[3-9]\d{9}(?!\d)/g
  let phoneMatch: RegExpExecArray | null
  while ((phoneMatch = phoneRegex.exec(masked)) !== null) {
    const original = phoneMatch[0]
    const masked_phone = original.slice(0, 3) + '****' + original.slice(7)
    matches.push({
      type: 'phone',
      original,
      masked: masked_phone,
      position: [phoneMatch.index, phoneMatch.index + original.length],
    })
    masked = masked.replace(original, masked_phone)
  }

  // 3. 中文姓名 — 仅人类称呼上下文
  const nameContextRegex =
    /(?:我叫|我是|主人[是叫]|联系人[：:]\s*|我的名字[是叫]|称呼[：:]\s*)([一-龥]{2,4})/g
  let nameMatch: RegExpExecArray | null
  while ((nameMatch = nameContextRegex.exec(text)) !== null) {
    const original = nameMatch[1]
    const masked_name = original.slice(0, 1) + '*'.repeat(original.length - 1)
    matches.push({
      type: 'name',
      original,
      masked: masked_name,
      position: [nameMatch.index + nameMatch[0].indexOf(original), nameMatch.index + nameMatch[0].length],
    })
    masked = masked.replace(original, masked_name)
  }

  // 4. 地址
  const addressRegex =
    /(?:地址[：:]\s*|住[在址][：:]\s*|位于)([一-龥]{2,}(?:省|市|区|县|镇|乡|路|街|巷|号|弄|栋|楼|单元|室|层|座).{0,30})/g
  let addrMatch: RegExpExecArray | null
  while ((addrMatch = addressRegex.exec(text)) !== null) {
    const original = addrMatch[1]
    matches.push({
      type: 'address',
      original,
      masked: '[地址已脱敏]',
      position: [addrMatch.index, addrMatch.index + addrMatch[0].length],
    })
    masked = masked.replace(original, '[地址已脱敏]')
  }

  // 也匹配无上下文的地址关键词组合
  const implicitAddrRegex =
    /[一-龥]{2,}(?:省|市|区|县)[一-龥\d]{2,}(?:路|街|巷|道|镇|乡)[\d一-龥]{0,10}(?:号|弄)[\d一-龥]{0,10}(?:栋|楼|单元|室|层)?/g
  let iAddrMatch: RegExpExecArray | null
  while ((iAddrMatch = implicitAddrRegex.exec(masked)) !== null) {
    const original = iAddrMatch[0]
    // 避免重复脱敏
    if (!matches.some((m) => m.type === 'address' && m.original === original)) {
      matches.push({
        type: 'address',
        original,
        masked: '[地址已脱敏]',
        position: [iAddrMatch.index, iAddrMatch.index + original.length],
      })
      masked = masked.replace(original, '[地址已脱敏]')
    }
  }

  return { maskedText: masked, piiMatches: matches }
}

/**
 * 检测违规内容
 */
function detectViolations(text: string): ViolationRecord[] {
  const violations: ViolationRecord[] = []
  const now = Date.now()

  // 加载所有合规词库
  const wordLists = loadComplianceWordLists()

  for (const list of wordLists) {
    for (const keyword of list.keywords) {
      if (text.includes(keyword)) {
        const category = mapCategory(list.category)
        violations.push({
          ruleName: list.category,
          matchedText: keyword,
          timestamp: now,
          category,
        })
        break // 每个词库只记一次
      }
    }

    // 正则匹配
    for (const pattern of list.patterns) {
      try {
        const regex = new RegExp(pattern, 'i')
        const match = text.match(regex)
        if (match && !violations.some((v) => v.ruleName === list.category)) {
          violations.push({
            ruleName: list.category,
            matchedText: match[0],
            timestamp: now,
            category: mapCategory(list.category),
          })
          break
        }
      } catch {
        // 无效正则，跳过
      }
    }
  }

  return violations
}

function isSafetySeekingToxicExposure(text: string, violation: ViolationRecord): boolean {
  if (violation.category !== 'folk_remedy') return false

  const mentionsToxicItem = /(洋葱|大蒜|巧克力|葡萄|防冻液|老鼠药|百合|对乙酰氨基酚|扑热息痛)/.test(text)
  const describesExposure = /(吃了|误食|误吃|偷吃|吞了|舔了|接触|咬了|不小心.*吃)/.test(text)
  const asksForSafetyHelp = /(怎么办|怎么处理|要不要去医院|会不会中毒|中毒|精神差|牙龈苍白|呕吐|抽搐|流口水)/.test(text)
  const hasRemedyIntent = /(给.*喂|喂.*(治|驱虫|好)|偏方|土方|民间|祖传|能不能.*喂|可以.*喂|灌|抹|涂|擦)/.test(text)

  return mentionsToxicItem && describesExposure && asksForSafetyHelp && !hasRemedyIntent
}

/**
 * 加载所有合规词库
 */
function loadComplianceWordLists(): ComplianceWordList[] {
  const dir = path.resolve(process.cwd(), 'data', 'compliance')
  const files = ['general_sensitive.json', 'vet_prohibited.json', 'invasive_procedures.json', 'folk_remedies.json']

  const lists: ComplianceWordList[] = []
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8')
      lists.push(JSON.parse(raw) as ComplianceWordList)
    } catch {
      // 文件不存在则跳过
    }
  }

  return lists
}

/**
 * 词库类别 → 违规类别映射
 */
function mapCategory(category: string): ViolationCategory {
  switch (category) {
    case 'general_sensitive':
      return 'sensitive_keyword'
    case 'vet_prohibited':
      return 'prescription_request'
    case 'invasive_procedures':
      return 'invasive_procedure'
    case 'folk_remedies':
      return 'folk_remedy'
    default:
      return 'other'
  }
}
