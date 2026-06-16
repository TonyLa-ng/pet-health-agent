// ============================================
// 类型系统集成验证 — 确保所有模块可互引用，无循环依赖
// ============================================

import { describe, it, expect } from 'vitest'

// 按依赖顺序导入：types 之间不应该有运行时循环依赖
import {
  SessionState,
  ConfidenceBadge,
  TERMINAL_STATES,
} from '@/agent/types'
import type {
  TriageResult,
  NormalizedInput,
  AssessmentResult,
  RawDiagnosis,
  ScoredDiagnosis,
  ClinicalReport,
  ReportTemplate,
} from '@/agent/types'

import type {
  KnowledgeEntry,
  EmergencyRules,
  DurationDict,
  SpeciesConfig,
  SearchResult,
} from '@/knowledge/types'

import type {
  PetProfile,
  ProfileValidation,
  Session,
  SessionContext,
} from '@/store/types'

import type {
  InputComplianceResult,
  OutputComplianceResult,
  FeedbackEntry,
} from '@/compliance/types'

import type {
  LLMConfig,
  LLMCallResult,
  SSEEvent,
  PipelineInput,
  PipelineOutput,
} from '@/models/types'

import type {
  ProhibitionRule,
  RuleMatchResult,
  RuleEngineOutput,
} from '@/rules/types'

describe('Type system integrity', () => {
  it('all agent types should be importable', () => {
    expect(SessionState.CREATED).toBe('created')
    expect(SessionState.REPORTED).toBe('reported')
    expect(ConfidenceBadge.GREEN).toBe('green')
    expect(TERMINAL_STATES.has(SessionState.EXPIRED)).toBe(true)
  })

  it('SessionState enum should have all states defined', () => {
    const states = Object.values(SessionState)
    expect(states).toContain('created')
    expect(states).toContain('profiling')
    expect(states).toContain('collecting')
    expect(states).toContain('followup_r1')
    expect(states).toContain('followup_r2')
    expect(states).toContain('followup_r3')
    expect(states).toContain('diagnosing')
    expect(states).toContain('reported')
    expect(states).toContain('emergency_triggered')
    expect(states).toContain('incomplete')
    expect(states).toContain('expired')
    expect(states).toHaveLength(11)
  })

  it('TERMINAL_STATES should contain exactly 4 states', () => {
    expect(TERMINAL_STATES.size).toBe(4)
    expect(TERMINAL_STATES.has(SessionState.REPORTED)).toBe(true)
    expect(TERMINAL_STATES.has(SessionState.EMERGENCY_TRIGGERED)).toBe(true)
    expect(TERMINAL_STATES.has(SessionState.INCOMPLETE)).toBe(true)
    expect(TERMINAL_STATES.has(SessionState.EXPIRED)).toBe(true)
    // 非终态不在集合中（DIAGNOSING 可向前跳转）
    expect(TERMINAL_STATES.has(SessionState.DIAGNOSING)).toBe(false)
    expect(TERMINAL_STATES.has(SessionState.CREATED)).toBe(false)
    expect(TERMINAL_STATES.has(SessionState.COLLECTING)).toBe(false)
  })

  it('ConfidenceBadge enum should have 4 levels', () => {
    expect(Object.values(ConfidenceBadge)).toHaveLength(4)
    expect(ConfidenceBadge.GREEN).toBe('green')
    expect(ConfidenceBadge.YELLOW).toBe('yellow')
    expect(ConfidenceBadge.ORANGE).toBe('orange')
    expect(ConfidenceBadge.RED).toBe('red')
  })

  // 编译时验证：以下类型注解在导入时已检查
  it('cross-module type references should compile', () => {
    // PipelineInput 引用 agent types
    const input: PipelineInput = {
      sessionId: 'test-session',
      petId: 'test-pet',
      text: '狗吐了',
    }
    expect(input.text).toBe('狗吐了')

    // SessionContext 引用 agent types
    const ctx: SessionContext = {
      mandatoryFieldsCompleted: [],
      mandatoryFieldsMissing: ['duration'],
      uncollectableFields: [],
      fieldDataValidity: {},
    }
    expect(ctx.mandatoryFieldsMissing).toContain('duration')

    // PetProfile should accept valid data
    const profile: PetProfile = {
      id: 'pet-1',
      species: '犬',
      breed: '金毛',
      age: 3,
      weight: 25,
      gender: 'male',
      neutered: true,
      vaccination: '已完成基础免疫',
      medicalHistory: '无',
      allergies: '无',
      chronicConditions: '无',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    expect(profile.species).toBe('犬')
  })
})
