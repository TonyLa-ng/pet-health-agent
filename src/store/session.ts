// ============================================
// M8: Session State Machine (会话状态机)
// 完整跳转表 + 双超时 + 会话锁 + 限流计数
// ============================================

import type { Session, SessionContext } from './types'
import { SessionState, TERMINAL_STATES } from '@/agent/types'
import { generateId } from '@/crypto/encrypt'

type RateLimitStore = Map<string, { count: number; resetAt: number }>

interface GlobalSessionStores {
  __petHealthSessions?: Map<string, Session>
  __petHealthRateLimits?: RateLimitStore
  __petHealthSessionCreateLimits?: RateLimitStore
}

const globalStores = globalThis as typeof globalThis & GlobalSessionStores

/** 会话存储（MVP 内存） */
const sessions = globalStores.__petHealthSessions ??= new Map<string, Session>()

/** 限流计数器 */
const rateLimits = globalStores.__petHealthRateLimits ??= new Map<string, { count: number; resetAt: number }>()
const sessionCreateLimits = globalStores.__petHealthSessionCreateLimits ??= new Map<string, { count: number; resetAt: number }>()

/** 配置 */
const USER_INPUT_TIMEOUT_MS = 30 * 60 * 1000  // 30 分钟
const SESSION_LOCK_TTL_MS = 5 * 1000          // 锁 TTL 5 秒

// ============================================
// 会话 CRUD
// ============================================

/** 创建会话 */
export function createSession(petId: string): Session {
  const id = generateId('ses')
  const now = Date.now()

  const session: Session = {
    id,
    petId,
    state: SessionState.CREATED,
    createdAt: now,
    lastActivityAt: now,
    expiresAt: now + USER_INPUT_TIMEOUT_MS,
    lockAcquiredAt: null,
    history: [],
    violationCount: 0,
    context: {
      mandatoryFieldsCompleted: [],
      mandatoryFieldsMissing: [],
      uncollectableFields: [],
      fieldDataValidity: {},
    },
  }

  sessions.set(id, session)
  return session
}

/** 获取会话 */
export function getSession(id: string): Session | null {
  const session = sessions.get(id)
  if (!session) return null

  // 检查是否过期
  if (Date.now() > session.expiresAt) {
    session.state = SessionState.EXPIRED
    return session
  }

  return session
}

export function getLatestActiveSession(petId: string): Session | null {
  let latest: Session | null = null
  const now = Date.now()

  for (const [, session] of sessions) {
    if (now > session.expiresAt) {
      session.state = SessionState.EXPIRED
      continue
    }
    if (session.petId !== petId || TERMINAL_STATES.has(session.state)) continue
    if (!latest || session.lastActivityAt >= latest.lastActivityAt) {
      latest = session
    }
  }

  return latest
}

/** 保存会话 */
export function saveSession(session: Session): void {
  session.lastActivityAt = Date.now()
  session.expiresAt = Date.now() + USER_INPUT_TIMEOUT_MS
  sessions.set(session.id, session)
}

// ============================================
// 状态跳转（唯一入口）
// ============================================

/** 状态跳转白名单 */
const VALID_TRANSITIONS: Record<string, SessionState[]> = {
  [SessionState.CREATED]: [SessionState.PROFILING, SessionState.COLLECTING, SessionState.EMERGENCY_TRIGGERED, SessionState.EXPIRED],
  [SessionState.PROFILING]: [SessionState.COLLECTING, SessionState.EMERGENCY_TRIGGERED, SessionState.EXPIRED],
  [SessionState.COLLECTING]: [SessionState.FOLLOWUP_R1, SessionState.DIAGNOSING, SessionState.EMERGENCY_TRIGGERED, SessionState.EXPIRED],
  [SessionState.FOLLOWUP_R1]: [SessionState.FOLLOWUP_R2, SessionState.DIAGNOSING, SessionState.INCOMPLETE, SessionState.EMERGENCY_TRIGGERED, SessionState.EXPIRED],
  [SessionState.FOLLOWUP_R2]: [SessionState.FOLLOWUP_R3, SessionState.DIAGNOSING, SessionState.INCOMPLETE, SessionState.EMERGENCY_TRIGGERED, SessionState.EXPIRED],
  [SessionState.FOLLOWUP_R3]: [SessionState.DIAGNOSING, SessionState.INCOMPLETE, SessionState.EMERGENCY_TRIGGERED, SessionState.EXPIRED],
  [SessionState.DIAGNOSING]: [SessionState.REPORTED, SessionState.EMERGENCY_TRIGGERED, SessionState.INCOMPLETE],
  [SessionState.REPORTED]: [],    // 终态
  [SessionState.EMERGENCY_TRIGGERED]: [], // 终态
  [SessionState.INCOMPLETE]: [],  // 终态
  [SessionState.EXPIRED]: [],     // 终态
}

/**
 * 执行状态跳转
 * @returns 跳转是否成功
 */
export function transition(
  session: Session,
  targetState: SessionState
): { success: boolean; error?: string } {
  // 终态不可回退
  if (TERMINAL_STATES.has(session.state)) {
    return { success: false, error: `终态 "${session.state}" 不可跳转` }
  }

  // 白名单检查
  const allowed = VALID_TRANSITIONS[session.state] || []
  if (!allowed.includes(targetState)) {
    return {
      success: false,
      error: `不支持从 "${session.state}" 跳转到 "${targetState}"`,
    }
  }

  session.state = targetState
  saveSession(session)
  return { success: true }
}

// ============================================
// 会话锁
// ============================================

/** 尝试获取会话锁（开发阶段已禁用） */
export function acquireLock(sessionId: string, lockTtlMs: number = SESSION_LOCK_TTL_MS): boolean {
  // 开发测试阶段：禁用会话锁，始终允许
  const session = getSession(sessionId)
  if (!session) return false
  return true
}

/** 释放会话锁 */
export function releaseLock(sessionId: string): void {
  const session = getSession(sessionId)
  if (session) {
    session.lockAcquiredAt = null
    saveSession(session)
  }
}

// ============================================
// 限流
// ============================================

/** 检查接口限流（开发阶段已禁用） */
export function checkRateLimit(
  _identifier: string,
  _limit: number,
  _windowMs: number = 60000,
  _store: Map<string, { count: number; resetAt: number }> = rateLimits
): { allowed: boolean; retryAfter?: number } {
  // 开发测试阶段：禁用限流
  return { allowed: true }
}

/** 检查会话创建限流（单 IP 5次/分钟） */
export function checkSessionCreateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  return checkRateLimit(`create:${ip}`, 5, 60000, sessionCreateLimits)
}

// ============================================
// 工具函数
// ============================================

/** 判断是否为紧急追问场景 */
export function isEmergencyFollowup(session: Session): boolean {
  const triage = session.context.triageResult
  return triage?.level === 'urgent' && session.state === SessionState.FOLLOWUP_R1
}

/** 检查会话是否应为只读（归档） */
export function isReadOnly(session: Session): boolean {
  return (
    session.state === SessionState.REPORTED ||
    session.state === SessionState.EXPIRED ||
    session.state === SessionState.EMERGENCY_TRIGGERED
  )
}

/** 重置限流计数器（测试用） */
export function clearRateLimits(): void {
  rateLimits.clear()
  sessionCreateLimits.clear()
}

/** 清空会话存储（测试用） */
export function clearSessions(): void {
  sessions.clear()
}

/** 获取活跃会话数（单用户限制 ≤ 3） */
export function getActiveSessionCount(userId: string): number {
  let count = 0
  const now = Date.now()
  for (const [, session] of sessions) {
    if (now > session.expiresAt) {
      session.state = SessionState.EXPIRED
      continue
    }

    if (session.petId === userId && !TERMINAL_STATES.has(session.state)) {
      count++
    }
  }
  return count
}
