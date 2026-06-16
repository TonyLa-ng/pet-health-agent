// ============================================
// M8: Session State Machine Tests
// ============================================

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createSession,
  getSession,
  transition,
  acquireLock,
  releaseLock,
  checkRateLimit,
  checkSessionCreateLimit,
  isReadOnly,
  clearSessions,
  clearRateLimits,
  getActiveSessionCount,
  getLatestActiveSession,
} from '../session'
import { SessionState } from '@/agent/types'

beforeEach(() => {
  clearSessions()
  clearRateLimits()
})

describe('Session CRUD', () => {
  it('should create a session', () => {
    const session = createSession('pet-001')
    expect(session.id).toBeDefined()
    expect(session.id.startsWith('ses-')).toBe(true)
    expect(session.state).toBe(SessionState.CREATED)
    expect(session.petId).toBe('pet-001')
  })

  it('should retrieve an existing session', () => {
    const created = createSession('pet-001')
    const retrieved = getSession(created.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(created.id)
  })

  it('should return null for non-existent session', () => {
    expect(getSession('nonexistent')).toBeNull()
  })

  it('should generate unique session IDs', () => {
    const s1 = createSession('pet-001')
    const s2 = createSession('pet-002')
    expect(s1.id).not.toBe(s2.id)
  })

  it('should count only active sessions for the requested pet', () => {
    createSession('pet-001')
    createSession('pet-002')
    const expired = createSession('pet-001')
    expired.expiresAt = Date.now() - 1

    expect(getActiveSessionCount('pet-001')).toBe(1)
    expect(getActiveSessionCount('pet-002')).toBe(1)
    expect(expired.state).toBe(SessionState.EXPIRED)
  })

  it('should return the latest active session for a pet', () => {
    const older = createSession('pet-001')
    const newer = createSession('pet-001')
    const otherPet = createSession('pet-002')
    newer.lastActivityAt = older.lastActivityAt + 1000
    otherPet.lastActivityAt = newer.lastActivityAt + 1000

    expect(getLatestActiveSession('pet-001')?.id).toBe(newer.id)
  })
})

describe('State Transitions', () => {
  it('should allow created → profiling', () => {
    const session = createSession('pet-001')
    const result = transition(session, SessionState.PROFILING)
    expect(result.success).toBe(true)
    expect(session.state).toBe(SessionState.PROFILING)
  })

  it('should allow created → collecting', () => {
    const session = createSession('pet-001')
    const result = transition(session, SessionState.COLLECTING)
    expect(result.success).toBe(true)
  })

  it('should allow created → emergency_triggered (急症直通)', () => {
    const session = createSession('pet-001')
    const result = transition(session, SessionState.EMERGENCY_TRIGGERED)
    expect(result.success).toBe(true)
  })

  it('should allow collecting → followup_r1', () => {
    const session = createSession('pet-001')
    transition(session, SessionState.COLLECTING)
    const result = transition(session, SessionState.FOLLOWUP_R1)
    expect(result.success).toBe(true)
  })

  it('should allow collecting → diagnosing (信息充足)', () => {
    const session = createSession('pet-001')
    transition(session, SessionState.COLLECTING)
    const result = transition(session, SessionState.DIAGNOSING)
    expect(result.success).toBe(true)
  })

  it('should allow diagnosing → reported', () => {
    const session = createSession('pet-001')
    transition(session, SessionState.COLLECTING)
    transition(session, SessionState.DIAGNOSING)
    const result = transition(session, SessionState.REPORTED)
    expect(result.success).toBe(true)
  })

  it('should allow diagnosing → incomplete (降级)', () => {
    const session = createSession('pet-001')
    transition(session, SessionState.COLLECTING)
    transition(session, SessionState.DIAGNOSING)
    const result = transition(session, SessionState.INCOMPLETE)
    expect(result.success).toBe(true)
  })
})

describe('Terminal State Protection', () => {
  it('should reject transition from reported', () => {
    const session = createSession('pet-001')
    transition(session, SessionState.COLLECTING)
    transition(session, SessionState.DIAGNOSING)
    transition(session, SessionState.REPORTED)

    const result = transition(session, SessionState.COLLECTING)
    expect(result.success).toBe(false)
    expect(result.error).toContain('终态')
  })

  it('should reject transition from emergency_triggered', () => {
    const session = createSession('pet-001')
    transition(session, SessionState.EMERGENCY_TRIGGERED)

    const result = transition(session, SessionState.COLLECTING)
    expect(result.success).toBe(false)
  })

  it('should reject transition from expired', () => {
    const session = createSession('pet-001')
    // 手动设置过期
    session.state = SessionState.EXPIRED
    const result = transition(session, SessionState.COLLECTING)
    expect(result.success).toBe(false)
  })

  it('should reject invalid transitions', () => {
    const session = createSession('pet-001')
    // created → followup_r2 不合法
    const result = transition(session, SessionState.FOLLOWUP_R2)
    expect(result.success).toBe(false)
  })
})

describe('Session Lock', () => {
  it('should acquire lock successfully', () => {
    const session = createSession('pet-001')
    const acquired = acquireLock(session.id)
    expect(acquired).toBe(true)
  })

  it('should always allow concurrent lock (lock disabled for dev)', () => {
    const session = createSession('pet-001')
    acquireLock(session.id)
    const secondAttempt = acquireLock(session.id)
    expect(secondAttempt).toBe(true)
  })

  it('should release lock', () => {
    const session = createSession('pet-001')
    acquireLock(session.id)
    releaseLock(session.id)
    // 释放后可以再次获取
    const reacquired = acquireLock(session.id)
    expect(reacquired).toBe(true)
  })
})

describe('Rate Limiting', () => {
  it('should allow requests within limit', () => {
    for (let i = 0; i < 15; i++) {
      const result = checkRateLimit(`test-ip-${i}`, 15)
      expect(result.allowed).toBe(true)
    }
  })

  it('should allow all requests (rate limiting disabled for dev)', () => {
    for (let i = 0; i < 100; i++) {
      const result = checkRateLimit('heavy-ip', 15)
      expect(result.allowed).toBe(true)
    }
  })

  it('should always allow session creation (rate limiting disabled for dev)', () => {
    for (let i = 0; i < 100; i++) {
      const result = checkSessionCreateLimit('creator-ip')
      expect(result.allowed).toBe(true)
    }
  })
})

describe('Read-only Detection', () => {
  it('should mark reported as read-only', () => {
    const session = createSession('pet-001')
    session.state = SessionState.REPORTED
    expect(isReadOnly(session)).toBe(true)
  })

  it('should mark expired as read-only', () => {
    const session = createSession('pet-001')
    session.state = SessionState.EXPIRED
    expect(isReadOnly(session)).toBe(true)
  })

  it('should mark emergency_triggered as read-only', () => {
    const session = createSession('pet-001')
    session.state = SessionState.EMERGENCY_TRIGGERED
    expect(isReadOnly(session)).toBe(true)
  })

  it('should NOT mark collecting as read-only', () => {
    const session = createSession('pet-001')
    session.state = SessionState.COLLECTING
    expect(isReadOnly(session)).toBe(false)
  })
})
