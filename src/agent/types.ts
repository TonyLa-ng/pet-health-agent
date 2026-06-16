// ============================================
// Agent Core Types — Session, Triage, Diagnosis, Report
// ============================================

/**
 * 会话状态枚举 — 完整状态机定义
 * 终态: DIAGNOSING, REPORTED, EMERGENCY_TRIGGERED, INCOMPLETE, EXPIRED
 */
export enum SessionState {
  CREATED = 'created',
  PROFILING = 'profiling',
  COLLECTING = 'collecting',
  FOLLOWUP_R1 = 'followup_r1',
  FOLLOWUP_R2 = 'followup_r2',
  FOLLOWUP_R3 = 'followup_r3',
  DIAGNOSING = 'diagnosing',
  REPORTED = 'reported',
  EMERGENCY_TRIGGERED = 'emergency_triggered',
  INCOMPLETE = 'incomplete',
  EXPIRED = 'expired',
}

/** 终态集合 — 不可回退到采集/追问阶段 */
export const TERMINAL_STATES: Set<SessionState> = new Set([
  SessionState.REPORTED,
  SessionState.EMERGENCY_TRIGGERED,
  SessionState.INCOMPLETE,
  SessionState.EXPIRED,
])

// ---- M2: Triage (急症检测) ----

/** 急症风险等级 */
export type TriageLevel = 'critical' | 'urgent' | 'watch' | 'normal'

/** 时长效应类型 — 决定急症评分方向 */
export type DurationEffect = 'negative' | 'positive' | 'neutral'

/** 时长提取结果 */
export type DurationBucket = 'less_than_1h' | '1h_to_6h' | '6h_to_24h' | 'more_than_24h' | 'unknown' | 'conflict'

/** 急症检测输出 */
export interface TriageResult {
  isEmergency: boolean
  level: TriageLevel
  score: number // 0-100
  alerts: string[]
  matchedSignals: string[]
  durationExtracted: DurationBucket
  durationConflict: boolean
  durationEffect: DurationEffect
  isRevisit: boolean
  lowRiskReminder: boolean
}

// ---- M3: Normalizer (症状归一化) ----

/** 症状 */
export interface Symptom {
  name: string // 标准化术语名称
  original: string // 用户原始表述
  category: 'chief' | 'accompanying' | 'vital' | 'environment'
  detail?: string // 附加描述
}

/** 体征指标 */
export interface VitalSign {
  type: 'temperature' | 'heart_rate' | 'respiratory_rate' | 'weight' | 'other'
  value: number
  unit: string
  isAbnormal: boolean // 是否超出物种正常范围
  normalRange?: { min: number; max: number }
}

/** 症状时间线 */
export interface Timeline {
  onset: string // 发病时间描述
  duration: DurationBucket // 标准化时长分类
  frequency: string // 发作频率描述
  pattern: 'continuous' | 'intermittent' | 'paroxysmal' | 'unknown'
}

/** M3 归一化输出 */
export interface NormalizedInput {
  chiefComplaint: Symptom[] // 主诉症状
  accompanyingSymptoms: Symptom[] // 伴随症状
  vitalSigns: VitalSign[] // 体征指标
  timeline: Timeline // 时间线
  environmentFactors: string[] // 环境因素
  excludedNoise: string[] // 被过滤的无效信息
}

// ---- M4: Interviewer (追问引擎) ----

/** 追问问题 */
export interface FollowUpQuestion {
  field: string // 对应必采字段名
  question: string // 问题文本
  guidance: string // 引导说明（为何需要该信息）
  priority: number // 优先级 1-9
}

/** M4 追问评估输出 */
export interface AssessmentResult {
  isComplete: boolean
  missingFields: string[]
  questions: FollowUpQuestion[]
  convergentCandidates?: Array<{ disease: string; score: number; reason: string }>
  roundsUsed: number
  skippedFields: string[]
  uncollectableFields: string[]
  mandatoryFieldsCompleted: string[]
  mandatoryFieldsMissing: string[]
}

// ---- M5: Diagnostician (诊断引擎) ----

/** LLM 返回的原始诊断 */
export interface RawDiagnosis {
  disease: string
  confidence_raw: number
  supportingEvidence: string
  opposingEvidence: string
  differentialDiagnosis: string[]
}

// ---- M6: Confidence (置信度计算) ----

/** 置信度徽章 */
export enum ConfidenceBadge {
  GREEN = 'green', // ≥ 80%
  YELLOW = 'yellow', // 65%-79%
  ORANGE = 'orange', // 50%-64%
  RED = 'red', // < 50%
}

/** 计算后的诊断（含置信度） */
export interface ScoredDiagnosis {
  disease: string
  confidence: number // 0-100 整数
  badge: ConfidenceBadge
  source: DiagnosisSource // 诊断来源
  supportingEvidence: string
  opposingEvidence: string
  differentialDiagnosis: string[]
  rawScores: {
    symptomMatch: number
    keySymptomHit: number
    knowledgeStrength: number
    infoCompleteness: number
  }
}

// ---- M7: Reporter (报告生成器) ----

/** 诊断来源 */
export type DiagnosisSource = 'knowledge_base' | 'llm_fallback' | 'web_search'

/** 外部来源 */
export interface ExternalSource {
  title: string
  url: string
  snippet: string
  publishedAt?: string
}

/** 报告模板类型 */
export type ReportTemplate = 'template_1' | 'template_2' | 'template_3' | 'template_4'

/** 模板 4 子类型 */
export type UnableToDiagnoseReason = 'insufficient_info' | 'atypical_symptoms' | 'no_knowledge_match'

/** 最终临床报告 */
export interface ClinicalReport {
  template: ReportTemplate
  unableToDiagnoseReason?: UnableToDiagnoseReason
  source: DiagnosisSource // 诊断来源
  webSources?: ExternalSource[]
  sections: ReportSection[]
  disclaimerText: string
  disclaimerHash: string
  generatedAt: number
}

/** 报告区块 */
export interface ReportSection {
  type: 'pet_info' | 'symptom_summary' | 'diagnosis' | 'differential' | 'home_care' | 'emergency_signs' | 'sources' | 'disclaimer'
  title: string
  content: string
  metadata?: Record<string, unknown>
}
