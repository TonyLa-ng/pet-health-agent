// ============================================
// Compliance Types — MX 合规校验层
// ============================================

/** PII 类型 */
export type PIIType = 'phone' | 'id_card' | 'name' | 'address'

/** PII 匹配结果 */
export interface PIIMatch {
  type: PIIType
  original: string
  masked: string
  position: [number, number] // [start, end] 在文本中的位置
}

/** 违规记录 */
export interface ViolationRecord {
  ruleName: string
  matchedText: string
  timestamp: number
  category: ViolationCategory
}

/** 违规类别 */
export type ViolationCategory =
  | 'sensitive_keyword'
  | 'prescription_request'
  | 'dosage_request'
  | 'absolute_statement'
  | 'invasive_procedure'
  | 'folk_remedy'
  | 'emotional_soothing'
  | 'other'

/** 输入合规校验结果 */
export interface InputComplianceResult {
  passed: boolean
  blocked: boolean
  maskedText: string // PII 脱敏后的文本
  violations: ViolationRecord[]
  piiMatches: PIIMatch[]
  violationCount: number // 当前会话累计违规次数
}

/** 输出合规校验结果 */
export interface OutputComplianceResult {
  passed: boolean
  blocked: boolean
  violations: ViolationRecord[]
  disclaimerHashMatch: boolean
  hashCheckEnabled: boolean
}

// ---- User Feedback (§15) ----

/** 反馈类型 */
export type FeedbackType = 'accurate' | 'inaccurate' | 'emergency_misjudge' | 'insufficient_info'

/** 反馈状态 */
export type FeedbackStatus = 'pending_review' | 'reviewed' | 'archived' | 'actioned'

/** 诊断快照（反馈时记录） */
export interface DiagnosisSnapshot {
  disease: string
  confidence: number
  badge: string
}

/** 用户反馈条目 */
export interface FeedbackEntry {
  id: string
  sessionId: string
  petId: string
  feedbackType: FeedbackType
  diagnosisSnapshot: DiagnosisSnapshot | null
  createdAt: number
  status: FeedbackStatus
  reviewerNotes?: string
}
