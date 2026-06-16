// ============================================
// Store Types — M0 宠物档案 + M8 会话状态
// ============================================

import type { SessionState } from '@/agent/types'
import type { TriageResult, NormalizedInput, AssessmentResult, ScoredDiagnosis, ClinicalReport } from '@/agent/types'
import type { ConsultationState } from '@/agent/consultation-state'

// ---- M0: Pet Profile ----

/** 宠物档案 */
export interface PetProfile {
  id: string
  // P0 必填
  species: '犬' | '猫' | '兔' | '仓鼠'
  breed: string
  age: number // 岁，0 < age ≤ 30
  weight: number // kg，0 < weight ≤ 100
  gender: 'male' | 'female' | 'unknown'
  neutered: boolean
  vaccination: string // 免疫情况
  // P1 必填
  medicalHistory: string // 既往病史
  allergies: string // 过敏史
  chronicConditions: string // 慢性病
  // 选填
  name?: string // 脱敏存储
  diet?: string
  environment?: string
  exercise?: string
  photo?: string
  createdAt: number
  updatedAt: number
}

/** 档案校验结果 */
export interface ProfileValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/** 就诊历史摘要 */
export interface VisitRecord {
  id: string
  petId: string
  date: number
  chiefComplaint: string[]
  diagnosis: string | null
  reportSummary: string
}

// ---- M8: Session ----

/** 会话消息 */
export interface Message {
  role: 'user' | 'agent' | 'system'
  content: string
  timestamp: number
  metadata?: Record<string, unknown>
}

/** 会话上下文 — 在状态流转中逐步填充 */
export interface SessionContext {
  triageResult?: TriageResult
  normalizedInput?: NormalizedInput
  interviewResult?: AssessmentResult
  diagnoses?: ScoredDiagnosis[]
  report?: ClinicalReport
  consultationState?: ConsultationState
  mandatoryFieldsCompleted: string[]
  mandatoryFieldsMissing: string[]
  uncollectableFields: string[]
  fieldDataValidity: Record<string, boolean>
  historicalReference?: string // 历史会话摘要（仅展示）
}

/** 问诊会话 */
export interface Session {
  id: string
  petId: string
  state: SessionState
  createdAt: number
  lastActivityAt: number
  expiresAt: number
  lockAcquiredAt: number | null
  history: Message[]
  violationCount: number // 违规计数（≥ 3 终止）
  previousSessionId?: string
  context: SessionContext
}

/** 会话锁状态 */
export interface SessionLock {
  acquired: boolean
  acquiredAt: number | null
  sessionId: string
}
