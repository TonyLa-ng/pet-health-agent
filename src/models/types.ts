// ============================================
// Model Types — LLM 客户端 + Token 预算
// ============================================

import type { TriageResult, AssessmentResult, ClinicalReport } from '@/agent/types'

/** LLM 配置 */
export interface LLMConfig {
  provider: string
  apiKey: string
  baseUrl: string
  modelName: string
  backupModelName: string
  fallbackEnabled: boolean
  timeout: number // ms
  maxRetries: number
  temperature: number
  maxTokens: number
}

/** Token 预算 */
export interface TokenBudget {
  total: number // 总预算
  used: number // 已使用
  remaining: number // 剩余
  isExceeded: boolean
  strategy: TokenBudgetStrategy
}

/** Token 预算策略 */
export type TokenBudgetStrategy = 'full' | 'trimmed' | 'summary_only' | 'degraded'

/** 模型切换事件 */
export interface ModelSwitchEvent {
  from: string
  to: string
  reason: ModelSwitchReason
  timestamp: number
  sessionId: string
}

/** 模型切换原因 */
export type ModelSwitchReason = 'timeout' | 'server_error' | 'content_violation' | 'format_error' | 'manual'

/** LLM 调用结果 */
export interface LLMCallResult {
  success: boolean
  content: string | null
  error: LLMError | null
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  } | null
  switchedModel: boolean
  switchEvent?: ModelSwitchEvent
}

/** LLM 错误 */
export interface LLMError {
  type: LLMErrorType
  message: string
  statusCode?: number
  retryable: boolean
}

/** LLM 错误类型 */
export type LLMErrorType =
  | 'timeout'
  | 'server_error'
  | 'auth_error'
  | 'rate_limit'
  | 'network_error'
  | 'stream_interrupted'
  | 'content_unparseable'
  | 'token_budget_exceeded'
  | 'unknown'

// ---- SSE ----

/** SSE 事件类型 */
export type SSEEventType = 'triage' | 'interview' | 'diagnosis' | 'report' | 'error' | 'done'

/** SSE 事件 */
export interface SSEEvent {
  section: SSEEventType
  data: unknown
  timestamp: number
  isComplete: boolean // 该 section 是否已完成
}

/** SSE 断点标记 */
export interface SSEBreakpoint {
  section: SSEEventType
  receivedAt: number
  data: unknown
}

// ---- Pipeline ----

/** 问诊管道输入 */
export interface PipelineInput {
  sessionId: string
  petId: string
  text: string // 用户输入
}

/** 问诊管道输出 */
export interface PipelineOutput {
  triage: TriageResult
  interview?: AssessmentResult
  report?: ClinicalReport
  sseEvents: SSEEvent[]
}
