// ============================================
// M0: Pet Profile System (宠物档案系统)
// CRUD + 合法性校验 + 复诊识别 + 历史对比
// ============================================

import type { PetProfile, ProfileValidation, VisitRecord } from './types'
import { encrypt, decrypt, maskName, generateId } from '@/crypto/encrypt'

type ProfileCreateData = Omit<PetProfile, 'id' | 'createdAt' | 'updatedAt'>

interface GlobalProfileStores {
  __petHealthProfiles?: Map<string, PetProfile>
  __petHealthVisitHistory?: Map<string, VisitRecord[]>
}

const globalStores = globalThis as typeof globalThis & GlobalProfileStores

/** 内存存储（MVP 阶段，后续迁 SQLite） */
const profiles = globalStores.__petHealthProfiles ??= new Map<string, PetProfile>()
const visitHistory = globalStores.__petHealthVisitHistory ??= new Map<string, VisitRecord[]>()

/**
 * 创建宠物档案
 */
export function createProfile(data: ProfileCreateData): PetProfile {
  return createProfileRecord(generateId('pet'), data)
}

export function createProfileWithId(id: string, data: ProfileCreateData): PetProfile {
  const normalizedId = id.trim()
  if (!normalizedId) {
    throw new Error('Invalid profile id')
  }
  if (profiles.has(normalizedId)) {
    throw new Error(`Profile already exists: ${normalizedId}`)
  }

  return createProfileRecord(normalizedId, data)
}

function createProfileRecord(id: string, data: ProfileCreateData): PetProfile {
  const validation = validateProfile(data as PetProfile)
  if (!validation.valid) {
    throw new Error(`Invalid profile: ${validation.errors.join(', ')}`)
  }

  const now = Date.now()

  const profile: PetProfile = {
    ...data,
    id,
    // 宠物名脱敏存储
    name: data.name ? maskName(data.name) : undefined,
    createdAt: now,
    updatedAt: now,
  }

  profiles.set(id, profile)
  return profile
}

/**
 * 获取宠物档案
 */
export function getProfile(id: string): PetProfile | null {
  return profiles.get(id) || null
}

/**
 * 更新宠物档案
 */
export function updateProfile(id: string, data: Partial<PetProfile>): PetProfile {
  const existing = profiles.get(id)
  if (!existing) {
    throw new Error(`Profile not found: ${id}`)
  }

  const updated: PetProfile = {
    ...existing,
    ...data,
    id,
    updatedAt: Date.now(),
  }

  const validation = validateProfile(updated)
  if (!validation.valid) {
    throw new Error(`Invalid profile: ${validation.errors.join(', ')}`)
  }

  profiles.set(id, updated)
  return updated
}

/**
 * 校验档案合法性
 *
 * 规则：
 * - P0 必填：品种、年龄、体重、性别、免疫情况
 * - 年龄：0 < age ≤ 30
 * - 体重：0 < weight ≤ 100
 * - 品种：非空字符串
 */
export function validateProfile(profile: Partial<PetProfile>): ProfileValidation {
  const errors: string[] = []
  const warnings: string[] = []

  // P0 必填字段
  if (!profile.species || !['犬', '猫', '兔', '仓鼠'].includes(profile.species)) {
    errors.push('品种必须为犬/猫/兔/仓鼠')
  }
  if (!profile.breed || profile.breed.trim() === '') {
    errors.push('品种详情不能为空')
  }
  if (profile.age === undefined || profile.age === null) {
    errors.push('年龄不能为空')
  } else if (profile.age <= 0) {
    errors.push('年龄必须大于0')
  } else if (profile.age > 30) {
    errors.push('年龄不能超过30岁')
  }
  if (profile.weight === undefined || profile.weight === null) {
    errors.push('体重不能为空')
  } else if (profile.weight <= 0) {
    errors.push('体重必须大于0 kg')
  } else if (profile.weight > 100) {
    errors.push('体重不能超过100 kg')
  }
  if (!profile.gender || !['male', 'female', 'unknown'].includes(profile.gender)) {
    errors.push('性别不能为空')
  }
  if (!profile.vaccination || profile.vaccination.trim() === '') {
    errors.push('免疫情况不能为空（至少填写"无"或"不详"）')
  }

  // P1 必填字段 — 缺失仅告警
  if (!profile.medicalHistory || profile.medicalHistory.trim() === '') {
    warnings.push('既往病史未填写，可能影响诊断准确性')
  }
  if (!profile.allergies || profile.allergies.trim() === '') {
    warnings.push('过敏史未填写')
  }
  if (!profile.chronicConditions || profile.chronicConditions.trim() === '') {
    warnings.push('慢性病信息未填写')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 归档就诊记录
 */
export function archiveVisit(
  petId: string,
  record: Omit<VisitRecord, 'id' | 'petId' | 'date'>
): VisitRecord {
  const entry: VisitRecord = {
    id: generateId('visit'),
    petId,
    date: Date.now(),
    ...record,
  }

  const history = visitHistory.get(petId) || []
  history.push(entry)
  visitHistory.set(petId, history)

  return entry
}

/**
 * 获取就诊历史
 */
export function getVisitHistory(petId: string): VisitRecord[] {
  return visitHistory.get(petId) || []
}

/**
 * 复诊识别：检查历史中是否有同类症状
 *
 * @returns true 如果同一宠物在近期（30天）有同类症状记录
 */
export function isRevisit(petId: string, symptoms: string[]): boolean {
  const history = visitHistory.get(petId)
  if (!history || history.length === 0) return false

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

  for (const record of history) {
    if (record.date < thirtyDaysAgo) continue

    // 检查症状重叠度
    const overlap = record.chiefComplaint.filter((s) =>
      symptoms.some((current) => current === s || current.includes(s) || s.includes(current))
    )
    if (overlap.length >= 1) {
      return true
    }
  }

  return false
}

/**
 * 获取症状历史（同类症状的历史记录）
 */
export function getSymptomHistory(petId: string, symptom: string): VisitRecord[] {
  const history = visitHistory.get(petId) || []
  return history.filter((r) =>
    r.chiefComplaint.some((s) => s === symptom || s.includes(symptom) || symptom.includes(s))
  )
}

/**
 * 列出所有档案（管理用）
 */
export function listProfiles(): PetProfile[] {
  return Array.from(profiles.values())
}

/**
 * 清空存储（测试用）
 */
export function clearStore(): void {
  profiles.clear()
  visitHistory.clear()
}
