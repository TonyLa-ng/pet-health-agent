// ============================================
// M0: Pet Profile System Tests
// ============================================

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createProfile,
  createProfileWithId,
  getProfile,
  updateProfile,
  validateProfile,
  archiveVisit,
  getVisitHistory,
  isRevisit,
  getSymptomHistory,
  clearStore,
} from '../profile'

const validDogData = {
  species: '犬' as const,
  breed: '金毛',
  age: 3,
  weight: 25,
  gender: 'male' as const,
  neutered: true,
  vaccination: '已完成基础免疫',
  medicalHistory: '无',
  allergies: '无',
  chronicConditions: '无',
}

beforeEach(() => {
  clearStore()
})

describe('Profile Validation', () => {
  it('should validate a correct profile', () => {
    const result = validateProfile(validDogData)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject age <= 0', () => {
    const result = validateProfile({ ...validDogData, age: 0 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('年龄'))).toBe(true)
  })

  it('should reject age > 30', () => {
    const result = validateProfile({ ...validDogData, age: 35 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('年龄'))).toBe(true)
  })

  it('should reject weight <= 0', () => {
    const result = validateProfile({ ...validDogData, weight: 0 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('体重'))).toBe(true)
  })

  it('should reject weight > 100', () => {
    const result = validateProfile({ ...validDogData, weight: 120 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('体重'))).toBe(true)
  })

  it('should reject empty breed', () => {
    const result = validateProfile({ ...validDogData, breed: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('品种'))).toBe(true)
  })

  it('should reject empty vaccination', () => {
    const result = validateProfile({ ...validDogData, vaccination: '' })
    expect(result.valid).toBe(false)
  })

  it('should warn on missing P1 fields', () => {
    const result = validateProfile({
      ...validDogData,
      medicalHistory: '',
      allergies: '',
      chronicConditions: '',
    })
    expect(result.valid).toBe(true) // P1 缺失不阻止创建
    expect(result.warnings.length).toBeGreaterThanOrEqual(2)
  })

  it('should accept cat profile', () => {
    const result = validateProfile({
      ...validDogData,
      species: '猫',
      breed: '英短',
    })
    expect(result.valid).toBe(true)
  })
})

describe('Profile CRUD', () => {
  it('should create and retrieve a profile', () => {
    const profile = createProfile(validDogData)
    expect(profile.id).toBeDefined()
    expect(profile.id.startsWith('pet-')).toBe(true)
    expect(profile.species).toBe('犬')

    const retrieved = getProfile(profile.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.breed).toBe('金毛')
  })

  it('should create a profile with a stable caller supplied id', () => {
    const profile = createProfileWithId('pet-demo', validDogData)

    expect(profile.id).toBe('pet-demo')
    expect(getProfile('pet-demo')?.breed).toBe('金毛')
    expect(() => createProfileWithId('pet-demo', validDogData)).toThrow()
  })

  it('should mask pet name on create', () => {
    const profile = createProfile({ ...validDogData, name: '小白' })
    // 脱敏：仅保留首字
    expect(profile.name).toBe('小*')
  })

  it('should update a profile', () => {
    const profile = createProfile(validDogData)
    const updated = updateProfile(profile.id, { weight: 28, age: 4 })
    expect(updated.weight).toBe(28)
    expect(updated.age).toBe(4)
    expect(updated.updatedAt).toBeGreaterThanOrEqual(profile.updatedAt)
  })

  it('should reject update with invalid data', () => {
    const profile = createProfile(validDogData)
    expect(() => updateProfile(profile.id, { age: -1 })).toThrow()
  })

  it('should throw on update of non-existent profile', () => {
    expect(() => updateProfile('nonexistent', { weight: 10 })).toThrow()
  })

  it('should reject create with invalid data', () => {
    expect(() => createProfile({ ...validDogData, age: -5 })).toThrow()
  })

  it('should return null for missing profile', () => {
    expect(getProfile('nonexistent')).toBeNull()
  })
})

describe('Visit History & Revisit Detection', () => {
  it('should archive and retrieve visit history', () => {
    const profile = createProfile(validDogData)

    archiveVisit(profile.id, {
      chiefComplaint: ['呕吐', '食欲下降'],
      diagnosis: '急性胃炎',
      reportSummary: '初步判断为急性胃炎',
    })

    const history = getVisitHistory(profile.id)
    expect(history).toHaveLength(1)
    expect(history[0].chiefComplaint).toContain('呕吐')
    expect(history[0].petId).toBe(profile.id)
  })

  it('should detect revisit with same symptoms', () => {
    const profile = createProfile(validDogData)

    archiveVisit(profile.id, {
      chiefComplaint: ['呕吐', '食欲下降'],
      diagnosis: '急性胃炎',
      reportSummary: '',
    })

    const result = isRevisit(profile.id, ['呕吐', '精神萎靡'])
    expect(result).toBe(true)
  })

  it('should NOT detect revisit with different symptoms', () => {
    const profile = createProfile(validDogData)

    archiveVisit(profile.id, {
      chiefComplaint: ['跛行'],
      diagnosis: '扭伤',
      reportSummary: '',
    })

    const result = isRevisit(profile.id, ['呕吐'])
    expect(result).toBe(false)
  })

  it('should NOT detect revisit for old visits (> 30 days)', () => {
    const profile = createProfile(validDogData)

    // 手动插入一条旧记录
    const history = getVisitHistory(profile.id)
    history.push({
      id: 'old-visit',
      petId: profile.id,
      date: Date.now() - 40 * 24 * 60 * 60 * 1000, // 40 天前
      chiefComplaint: ['呕吐'],
      diagnosis: null,
      reportSummary: '',
    })

    const result = isRevisit(profile.id, ['呕吐'])
    // 40 天前的记录不应触发复诊
    expect(result).toBe(false)
  })

  it('should find symptom history', () => {
    const profile = createProfile(validDogData)

    archiveVisit(profile.id, {
      chiefComplaint: ['呕吐'],
      diagnosis: null,
      reportSummary: '',
    })
    archiveVisit(profile.id, {
      chiefComplaint: ['腹泻'],
      diagnosis: null,
      reportSummary: '',
    })

    const vomitingHistory = getSymptomHistory(profile.id, '呕吐')
    expect(vomitingHistory).toHaveLength(1)
  })

  it('should return empty history for pet with no visits', () => {
    expect(getVisitHistory('nonexistent')).toEqual([])
    expect(isRevisit('nonexistent', ['呕吐'])).toBe(false)
  })
})
