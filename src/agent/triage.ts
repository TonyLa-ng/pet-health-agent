// ============================================
// M2: Emergency Triage Engine (急症检测器)
// 三维评分：关键词 + 症状组合 + duration_effect 时长 + 严重度
// 100% 纯规则引擎，不调 LLM
// ============================================

import type { TriageResult, TriageLevel, DurationBucket, DurationEffect } from './types'
import { loadAllKnowledge, loadEmergencyRules, loadDurationDict } from '@/knowledge/loader'
import type { EmergencyRules, DurationDict } from '@/knowledge/types'
import { containsAffirmedTerm, hasAffirmedAny } from './negation'

/**
 * 检测用户输入中的急症信号
 *
 * @param text - 用户原始输入（已 PII 脱敏后）
 * @param species - 物种
 * @param isRevisit - 是否为复诊（M0 判断）
 * @returns TriageResult
 */
export function detectTriage(
  text: string,
  species: '犬' | '猫' | '兔' | '仓鼠',
  isRevisit = false
): TriageResult {
  const rules = loadEmergencyRules()
  const durationDict = loadDurationDict()

  // 1. 关键词匹配
  const { keywordScore, matchedSignals, activeEffects } = computeKeywordScore(
    text,
    rules,
    species
  )

  // 2. 症状组合评分
  const combinationScore = computeCombinationScore(text, rules)

  // 3. 时长提取与评分
  const { durationBucket, durationConflict, durationScore } = computeDurationScore(
    text,
    durationDict,
    rules,
    activeEffects
  )

  // 4. 严重度评分
  const severityScore = computeSeverityScore(text, rules)

  // 5. 加权汇总（v3.1 修正公式）
  let totalScore = Math.round(
    keywordScore * 0.4 +
      combinationScore * 0.35 +
      durationScore * 0.125 +
      severityScore * 0.125
  )

  const override = detectCriticalOverrides(text, species)
  if (override) {
    totalScore = Math.max(totalScore, override.minScore)
    for (const signal of override.signals) {
      if (!matchedSignals.includes(signal)) matchedSignals.push(signal)
    }
    activeEffects.push(...override.effects)
  }

  const knowledgeOverride = detectKnowledgeEmergencyOverrides(text, species)
  if (knowledgeOverride) {
    totalScore = Math.max(totalScore, knowledgeOverride.minScore)
    for (const signal of knowledgeOverride.signals) {
      if (!matchedSignals.includes(signal)) matchedSignals.push(signal)
    }
    activeEffects.push('negative')
  }

  // 6. 复诊权重调整
  if (isRevisit) {
    totalScore = Math.round(totalScore * 0.7)
  }

  // 7. 钳制到 0-100
  totalScore = Math.max(0, Math.min(100, totalScore))

  // 8. 确定风险等级
  const level = determineLevel(totalScore, rules)

  // 9. 低风险提醒
  const lowRiskReminder = checkLowRiskReminder(
    matchedSignals.length,
    combinationScore,
    durationBucket,
    severityScore,
    rules
  )

  // 10. 生成告警信息
  const alerts = generateAlerts(level, matchedSignals, totalScore)

  // 11. 确定主导 durationEffect
  const durationEffect = resolveDurationEffect(activeEffects)

  return {
    isEmergency: level === 'critical',
    level,
    score: totalScore,
    alerts,
    matchedSignals,
    durationExtracted: durationBucket,
    durationConflict,
    durationEffect,
    isRevisit,
    lowRiskReminder,
  }
}

function detectKnowledgeEmergencyOverrides(
  text: string,
  species: '犬' | '猫' | '兔' | '仓鼠'
): { minScore: number; signals: string[] } | null {
  if (species !== '犬' && species !== '猫') return null

  const entries = loadAllKnowledge(species)
  const signals: string[] = []
  let minScore = 0

  for (const entry of entries) {
    for (const emergencySign of entry.emergency_signs || []) {
      if (!shouldUseKnowledgeEmergencySign(text, emergencySign.sign)) continue
      if (!knowledgeEmergencySignMatches(text, emergencySign.sign)) continue
      const genericLabel = genericKnowledgeEmergencyLabel(emergencySign.sign)
      const signal = genericLabel || `${entry.disease}:${emergencySign.sign}`
      if (!signals.includes(signal)) signals.push(signal)
      minScore = Math.max(minScore, emergencySign.minTriageScore)
    }
  }

  return signals.length > 0 ? { minScore, signals } : null
}

function genericKnowledgeEmergencyLabel(sign: string): string | null {
  if (/^持续呕吐$|^血便$|^血便或黑便$|^明显脱水$|^精神极度萎靡$|^幼龄动物精神差$|^严重贫血$/.test(sign)) {
    return sign
  }
  return null
}

function shouldUseKnowledgeEmergencySign(text: string, sign: string): boolean {
  if (/抽搐/.test(sign)) {
    return /持续|不停|不止|口吐白沫|倒地|意识|昏迷|站不|中毒|误食|发热|幼犬|幼猫/.test(text)
  }

  const highSpecific =
    /番茄|酱油色|血便|黑血便|无尿|尿不出|呼吸困难|张口呼吸|发绀|发紫|休克|虚脱|无法站立|牙龈|体温|低体温|脱水|腹部急剧|难产|阴道异常出血|中毒|毒|持续呕吐|喝水即吐|眼窝|皮肤回弹/.test(sign)

  if (highSpecific) return true

  if (/抽搐/.test(sign)) {
    return /持续|反复|不停|倒地|昏迷|中毒|误食|发热|呼吸|发紫|幼犬/.test(text)
  }

  return false
}

function knowledgeEmergencySignMatches(text: string, sign: string): boolean {
  if (containsAffirmedTerm(text, sign)) return true

  if (/番茄|酱油色|血便|黑血便/.test(sign)) {
    return hasAffirmedAny(text, ['番茄', '酱油色', '黑便', '血便', '便血', '拉血']) &&
      hasAffirmedAny(text, ['腥臭', '特别臭', '腐败臭', '臭味'])
  }
  if (/呕吐/.test(sign) && /5次|喝水即吐|一直吐|不停吐|吐了好几次|反复吐/.test(text)) return true
  if (/脱水|皮肤回弹|眼窝|牙龈/.test(sign)) {
    return /脱水|眼窝下陷|皮肤回弹|牙龈.*(苍白|冰凉|干)/.test(text)
  }
  if (/体温/.test(sign)) return /40\.?[5-9]?|41|低体温|37\.?[0-5]?/.test(text)
  if (/喘气|黏膜发紫|倒地/.test(sign)) {
    return /喘|呼吸困难|黏膜.*紫|发紫|倒地/.test(text) ||
      (/抽搐/.test(text) && /幼犬|月龄|日龄|两个月|三个月/.test(text))
  }
  if (/无法站立/.test(sign)) return /站不起来|无法站立|不能站|倒地|瘫/.test(text)
  if (/精神虚脱/.test(sign)) return /虚脱|叫不醒|唤不醒|没有意识|精神.*(极差|完全不行)/.test(text)
  if (/嗜睡/.test(sign)) return /嗜睡|叫不醒|唤不醒/.test(text)

  const meaningfulTerms = sign
    .split(/[、，,或和\s/]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
  if (meaningfulTerms.length === 0) return false
  const hits = meaningfulTerms.filter((term) => containsAffirmedTerm(text, term)).length
  return hits >= Math.min(2, meaningfulTerms.length)
}

function detectCriticalOverrides(
  text: string,
  species: '犬' | '猫' | '兔' | '仓鼠'
): { minScore: number; signals: string[]; effects: DurationEffect[] } | null {
  const signals: string[] = []
  const effects: DurationEffect[] = []
  let minScore = 0

  const hasGdvPattern =
    /(胃扩张|胃扭转|GDV|腹部.*(胀|大|硬)|肚子.*(胀|大|硬)|肚子像气球)/i.test(text) &&
    /(干呕|吐不出来|呕不出来|流口水|站不稳|虚弱|休克|呼吸急促)/.test(text)
  if (species === '犬' && hasGdvPattern) {
    signals.push('胃扩张扭转')
    effects.push('negative')
    minScore = Math.max(minScore, 85)
  }

  const hasCatUrinaryBlock =
    species === '猫' &&
    /(尿不出|尿不出来|无法排尿|排不出尿|完全不排尿|没尿|无尿|只有几滴|仅几滴|一点尿)/.test(text) &&
    /(公猫|频繁|猫砂盆|蹲|惨叫|嚎叫|一直叫|精神差|呕吐|腹部)/.test(text)
  if (hasCatUrinaryBlock) {
    signals.push('尿闭')
    effects.push('negative')
    minScore = Math.max(minScore, 85)
  }

  const hasFelinePanleukopeniaPattern =
    species === '猫' &&
    /(幼猫|小猫|月龄|两个月|三个月|四个月|五个月|六个月)/.test(text) &&
    /(未免疫|没打疫苗|没打完|未打|疫苗.*没|疫苗.*未|免疫空白)/.test(text) &&
    /(发热|发烧|高热|高烧|体温高)/.test(text) &&
    /(呕吐|吐|干呕)/.test(text) &&
    /(腹泻|拉稀|拉肚子|水样便)/.test(text) &&
    /(精神差|精神很差|精神萎靡|没精神|蔫|虚弱)/.test(text)
  if (hasFelinePanleukopeniaPattern) {
    signals.push('猫瘟高危组合')
    effects.push('negative')
    minScore = Math.max(minScore, 85)
  }

  const hasToxicExposure =
    /(洋葱|大蒜|巧克力|葡萄|防冻液|老鼠药|百合|对乙酰氨基酚|扑热息痛)/.test(text) &&
    /(吃了|误食|误吃|偷吃|吞了|舔了|接触|咬了)/.test(text)
  const hasSevereToxinSigns =
    /(牙龈苍白|黏膜苍白|精神差|虚弱|站不稳|呕吐|抽搐|流口水|茶色尿|血尿)/.test(text)
  if (hasToxicExposure && hasSevereToxinSigns) {
    signals.push('中毒')
    effects.push('negative')
    minScore = Math.max(minScore, 85)
  } else if (hasToxicExposure) {
    signals.push('中毒')
    effects.push('negative')
    minScore = Math.max(minScore, 60)
  }

  const hasSevereVomiting =
    /(吐血|吐了血|呕吐物.*血|咖啡渣)/.test(text) &&
    /(一直吐|不停吐|反复吐|连续吐|吐了好几次|呕吐不止)/.test(text)
  if (hasSevereVomiting) {
    signals.push('持续呕吐')
    effects.push('positive')
    minScore = Math.max(minScore, 60)
  }

  return signals.length > 0 ? { minScore, signals, effects } : null
}

// ---- 维度 1: 关键词匹配 (权重 0.40) ----

function computeKeywordScore(
  text: string,
  rules: EmergencyRules,
  species: string
): {
  keywordScore: number
  matchedSignals: string[]
  activeEffects: DurationEffect[]
} {
  let score = 0
  const matchedSignals: string[] = []
  const activeEffects: DurationEffect[] = []

  for (const signal of rules.global_signals) {
    // 应用物种特化规则
    const speciesCfg = signal.species_override?.[species] || {}
    const keyword = speciesCfg.keyword || signal.keyword
    const baseScore = speciesCfg.base_score ?? signal.base_score
    const boostKeywords = speciesCfg.boost_keywords || signal.boost_keywords
    const boostScore = speciesCfg.boost_score ?? signal.boost_score

    const keywordTriggered = containsAffirmedTerm(text, keyword)
    const standaloneBoosts = boostKeywords.filter(
      (boost) => containsAffirmedTerm(text, boost) && canBoostTriggerSignal(keyword, boost)
    )
    const triggered = keywordTriggered || standaloneBoosts.length > 0

    if (triggered) {
      score += baseScore
      matchedSignals.push(keyword)
      activeEffects.push(signal.duration_effect)

      // 检查增强关键词
      for (const boost of boostKeywords) {
        if (containsAffirmedTerm(text, boost) && (keywordTriggered || canBoostTriggerSignal(keyword, boost))) {
          score += boostScore
        }
      }
    }
  }

  return {
    keywordScore: Math.min(score, 100),
    matchedSignals,
    activeEffects,
  }
}

// ---- 维度 2: 症状组合评分 (权重 0.35) ----

function computeCombinationScore(
  text: string,
  rules: EmergencyRules
): number {
  let score = 0

  for (const signal of rules.global_signals) {
    // 检查是否匹配（同关键词匹配逻辑）
    const allTriggers = [signal.keyword]
    const speciesCfg = signal.species_override || {}
    for (const [, cfg] of Object.entries(speciesCfg)) {
      if ((cfg as { boost_keywords?: string[] }).boost_keywords) {
        allTriggers.push(
          ...(cfg as { boost_keywords: string[] }).boost_keywords.filter((boost) =>
            canBoostTriggerSignal(signal.keyword, boost)
          )
        )
      }
    }
    allTriggers.push(
      ...signal.boost_keywords.filter((boost) => canBoostTriggerSignal(signal.keyword, boost))
    )
    const triggered = allTriggers.some((t: string) => containsAffirmedTerm(text, t))
    if (!triggered) continue

    let combosFound = 0
    for (const combo of signal.combination_boost) {
      if (combo === signal.keyword) continue
      if (containsAffirmedTerm(text, combo)) {
        combosFound++
      }
    }

    // v3.1 修正：2 组合=40分, 3+ 组合=60分（上限）
    if (combosFound >= 3) {
      score += 60
    } else if (combosFound >= 2) {
      score += 40
    } else if (combosFound === 1) {
      score += 15
    }
  }

  return Math.min(score, 60) // 组合分上限
}

function canBoostTriggerSignal(keyword: string, boost: string): boolean {
  const genericBoosts = new Set([
    '持续',
    '不停',
    '一直',
    '频繁',
    '反复',
    '吃了',
    '误食',
    '误吃',
    '咬过',
    '舔过',
    '误食',
    '吞下',
    '咽下',
    '吞入',
    '大量',
    '不止',
    '一直流',
    '伤口',
    '卡住',
  ])

  if (genericBoosts.has(boost)) return false
  if (boost.includes(keyword)) return true
  return boost.length >= 2
}

// ---- 维度 3: 时长评分 (权重 0.125) ----

function computeDurationScore(
  text: string,
  dict: DurationDict,
  rules: EmergencyRules,
  activeEffects: DurationEffect[]
): {
  durationBucket: DurationBucket
  durationConflict: boolean
  durationScore: number
} {
  // 时长提取
  const { bucket, conflict } = extractDuration(text, dict)

  // 确定使用的 duration_effect（取第一个匹配信号的 effect）
  const effect = activeEffects.length > 0 ? activeEffects[0] : 'neutral'

  // 查表获取分数
  const scoringTable = rules.duration_scoring
  const effectScoring = scoringTable[effect] || scoringTable.neutral

  const score = effectScoring[bucket] ?? effectScoring['unknown'] ?? 0

  return {
    durationBucket: bucket,
    durationConflict: conflict,
    durationScore: score,
  }
}

// ---- 维度 4: 严重度评分 (权重 0.125) ----

function computeSeverityScore(
  text: string,
  rules: EmergencyRules
): number {
  let score = 0

  for (const indicator of rules.severity_indicators) {
    if (containsAffirmedTerm(text, indicator.signal)) {
      score += indicator.score
    }
  }

  return Math.min(score, 100)
}

// ---- 风险等级判定 ----

function determineLevel(
  totalScore: number,
  rules: EmergencyRules
): TriageLevel {
  if (totalScore >= rules.risk_levels.critical.min_score) return 'critical'
  if (totalScore >= rules.risk_levels.urgent.min_score) return 'urgent'
  if (totalScore >= rules.risk_levels.watch.min_score) return 'watch'
  return 'normal'
}

// ---- 低风险提醒 ----

function checkLowRiskReminder(
  matchedSignalCount: number,
  combinationScore: number,
  durationBucket: DurationBucket,
  severityScore: number,
  rules: EmergencyRules
): boolean {
  if (!rules.low_risk_reminder.enabled) return false

  return (
    matchedSignalCount === 1 &&
    combinationScore === 0 &&
    durationBucket === 'unknown' &&
    severityScore === 0
  )
}

// ---- 告警信息生成 ----

function generateAlerts(
  level: TriageLevel,
  matchedSignals: string[],
  totalScore: number
): string[] {
  const alerts: string[] = []

  if (level === 'critical') {
    alerts.push('⚠️ 检测到危重急症信号，请立即前往24小时宠物医院急诊')
  } else if (level === 'urgent') {
    alerts.push('⚠️ 检测到紧急症状，建议尽快就医')
  } else if (level === 'watch') {
    alerts.push('检测到需要关注的症状，请在报告中查看紧急就医指征')
  }

  if (matchedSignals.length > 0) {
    alerts.push(`匹配急症信号: ${matchedSignals.join('、')}`)
  }

  alerts.push(`急症评分: ${totalScore}/100`)

  return alerts
}

// ---- 主导 durationEffect ----

function resolveDurationEffect(
  effects: DurationEffect[]
): DurationEffect {
  // 如果同时匹配到 negative 和 positive 信号，优先 negative（更危险）
  if (effects.includes('negative')) return 'negative'
  if (effects.includes('positive')) return 'positive'
  return effects.length > 0 ? effects[0] : 'neutral'
}

// ============================================
// 时长提取
// ============================================

/**
 * 从文本中提取症状持续时间
 * 使用 duration_dict.json 中的关键词匹配
 */
export function extractDuration(
  text: string,
  dict?: DurationDict
): { bucket: DurationBucket; conflict: boolean } {
  const d = dict || loadDurationDict()

  // 收集所有匹配的时长类别
  const hits: DurationBucket[] = []

  for (const [bucket, mapping] of Object.entries(d.mappings)) {
    const { keywords } = mapping as { keywords: string[]; pattern: string }
    for (const kw of keywords) {
      if (text.includes(kw)) {
        hits.push(bucket as DurationBucket)
        break // 该 bucket 已命中，跳出内层循环
      }
    }
  }

  // 去重
  const uniqueHits = [...new Set(hits)]

  // 无命中 → 检查模糊标记
  if (uniqueHits.length === 0) {
    const hasFuzzy = d.fuzzy_markers.some((m) => text.includes(m))
    return {
      bucket: hasFuzzy ? 'unknown' : 'unknown',
      conflict: false,
    }
  }

  // 单种命中
  if (uniqueHits.length === 1) {
    return { bucket: uniqueHits[0], conflict: false }
  }

  // 多种命中 → 冲突检测
  // 检查是否同时出现了短时长和长时长关键词
  const hasShort = uniqueHits.some(
    (h) => h === 'less_than_1h' || h === '1h_to_6h'
  )
  const hasLong = uniqueHits.some(
    (h) => h === '6h_to_24h' || h === 'more_than_24h'
  )

  if (hasShort && hasLong) {
    return { bucket: 'conflict', conflict: true }
  }

  // 相近类别不视为冲突，取第一个
  return { bucket: uniqueHits[0], conflict: false }
}
