// ============================================
// M6: Confidence Calculator (置信度计算器)
// 四维加权算法 + 物种系数 + 无法采集扣分 → 图标映射
// 纯算法模块，不调 LLM，不决定模板选择
// ============================================

import type { ScoredDiagnosis, ConfidenceBadge, DiagnosisSource } from './types'
import type { RawDiagnosis } from './types'

/**
 * 计算置信度
 *
 * @param rawDiagnoses - LLM 返回的原始诊断列表
 * @param symptomMatch - 症状匹配详情
 * @param infoCompleteness - 信息收集完整度 (0-1)
 * @param species - 目标物种
 * @param isCrossSpecies - 是否跨物种检索结果
 * @param uncollectableCount - 无法采集字段数
 */
export function calculate(
  rawDiagnoses: RawDiagnosis[],
  symptomMatch: SymptomMatchInput,
  infoCompleteness: number,
  species: string,
  isCrossSpecies: boolean,
  uncollectableCount: number = 0,
  source: DiagnosisSource = 'knowledge_base',
  symptomMatchByDisease: Record<string, SymptomMatchInput & { isCrossSpecies?: boolean }> = {}
): ScoredDiagnosis[] {
  return rawDiagnoses.map((raw) => {
    const diseaseMatch = symptomMatchByDisease[raw.disease] || symptomMatch
    const diseaseIsCrossSpecies = symptomMatchByDisease[raw.disease]?.isCrossSpecies ?? isCrossSpecies

    // 维度 1: 症状匹配完整度 (权重 0.40)
    const symptomMatchScore = scoreSymptomMatch(diseaseMatch.matchRate)

    // 维度 2: 关键症状命中率 (权重 0.30)
    const keyHitScore = scoreKeyHitRate(diseaseMatch.primaryHitRate)

    // 维度 3: 知识库支持强度 (权重 0.15)
    const knowledgeScore = scoreKnowledgeStrength(diseaseMatch.knowledgeConfidence)

    // 维度 4: 信息收集完整度 (权重 0.15)
    let infoScore = scoreInfoCompleteness(infoCompleteness)

    // 无法采集字段扣分：每 1 个扣 5 分
    infoScore = Math.max(0, infoScore - uncollectableCount * 5)

    // 加权汇总
    let rawScore =
      symptomMatchScore * 0.4 +
      keyHitScore * 0.3 +
      knowledgeScore * 0.15 +
      infoScore * 0.15

    // 钳制到 [0, 100]
    rawScore = clamp(rawScore, 0, 100)

    // 物种系数
    const speciesCoefficient = diseaseIsCrossSpecies ? 0.5 : 1.0

    // 最终置信度（取整）
    let confidence = Math.round(rawScore * speciesCoefficient)

    // 非专项知识库来源：置信度封顶，避免把外部搜索/通用模型包装成确诊
    if (source === 'llm_fallback' || source === 'web_search') {
      confidence = Math.min(confidence, 60)
    }

    // 图标映射
    const badge = mapBadge(confidence)

    return {
      disease: raw.disease,
      confidence,
      badge,
      source,
      supportingEvidence: raw.supportingEvidence || '',
      opposingEvidence: raw.opposingEvidence || '',
      differentialDiagnosis: raw.differentialDiagnosis || [],
      rawScores: {
        symptomMatch: symptomMatchScore,
        keySymptomHit: keyHitScore,
        knowledgeStrength: knowledgeScore,
        infoCompleteness: infoScore,
      },
    }
  })
}

/** 症状匹配完整度 → 得分 */
function scoreSymptomMatch(matchRate: number): number {
  if (matchRate >= 0.8) return 100
  if (matchRate >= 0.6) return 80
  if (matchRate >= 0.4) return 50
  if (matchRate >= 0.2) return 30
  return 10
}

/** 关键症状命中率 → 得分 */
function scoreKeyHitRate(hitRate: number): number {
  if (hitRate >= 1.0) return 100
  if (hitRate >= 0.7) return 80
  if (hitRate >= 0.5) return 50
  if (hitRate >= 0.3) return 25
  return 5
}

/** 知识库置信度 → 得分 */
function scoreKnowledgeStrength(confidence: string): number {
  switch (confidence) {
    case 'high': return 100
    case 'medium': return 70
    case 'low': return 40
    default: return 40
  }
}

/** 信息收集完整度 → 得分 */
function scoreInfoCompleteness(completeness: number): number {
  if (completeness >= 0.8) return 100
  if (completeness >= 0.6) return 70
  if (completeness >= 0.4) return 40
  return 15
}

/** 置信度 → 图标 */
function mapBadge(confidence: number): ConfidenceBadge {
  if (confidence >= 80) return 'green' as ConfidenceBadge
  if (confidence >= 65) return 'yellow' as ConfidenceBadge
  if (confidence >= 50) return 'orange' as ConfidenceBadge
  return 'red' as ConfidenceBadge
}

/** 钳制函数 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** 症状匹配输入 */
export interface SymptomMatchInput {
  matchRate: number       // 症状匹配率 (0-1)
  primaryHitRate: number  // 主要症状命中率 (0-1)
  knowledgeConfidence: string // 知识条目 confidence 字段
}

/** 计算信息收集完整度（基于已采集字段数/总必采字段数） */
export function calcInfoCompleteness(collectedCount: number, totalCount: number = 9): number {
  if (totalCount === 0) return 0
  return Math.min(1, collectedCount / totalCount)
}
