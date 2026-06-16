import { describe, expect, it } from 'vitest'
import {
  classifyCategoryPath,
  isInfectiousExposure,
  isReproductiveSignal,
  isToxinExposure,
} from '../category-classifier'

describe('consultation category classifier', () => {
  it('routes diarrhea into digestive, infectious, parasitic, and toxin scopes', () => {
    const result = classifyCategoryPath({
      species: '犬',
      symptoms: ['腹泻'],
      rawText: '我家狗拉肚子',
      pet: { gender: 'male' },
    })

    expect(result.categoryPath).toEqual(expect.arrayContaining(['内科', '消化系统', '传染病', '寄生虫病', '中毒']))
    expect(result.matchedRules).toContain('digestive')
    expect(result.isFallback).toBe(false)
    expect(result.scoreByCategory.传染病).toBeGreaterThanOrEqual(1)
  })

  it('promotes infectious disease scope when recent animal contact is reported', () => {
    const result = classifyCategoryPath({
      species: '犬',
      symptoms: ['腹泻'],
      rawText: '前几天跟别的动物玩过，现在拉肚子',
      pet: { gender: 'male' },
    })

    expect(isInfectiousExposure(result.text)).toBe(true)
    expect(result.categoryPath[0]).toBe('传染病')
    expect(result.evidence).toContain('infectious_exposure')
  })

  it('adds reproductive scope for intact female compatible complaints', () => {
    const result = classifyCategoryPath({
      species: '猫',
      symptoms: ['腹痛', '精神差'],
      rawText: '未绝育母猫肚子疼，最近有阴道分泌物',
      pet: { gender: 'female', neutered: false },
    })

    expect(isReproductiveSignal(result.text)).toBe(true)
    expect(result.categoryPath).toEqual(expect.arrayContaining(['妇科/产科', '生殖系统']))
  })

  it('falls back to internal medicine for unrelated vague complaints', () => {
    const result = classifyCategoryPath({
      species: '猫',
      symptoms: [],
      rawText: '今天感觉不太对，但说不上来',
    })

    expect(result.categoryPath).toEqual(['内科'])
    expect(result.isFallback).toBe(true)
  })

  it('recognizes toxin exposure without requiring digestive words', () => {
    const result = classifyCategoryPath({
      species: '犬',
      symptoms: [],
      rawText: '狗狗可能吃了老鼠药，现在有点虚弱',
    })

    expect(isToxinExposure(result.text)).toBe(true)
    expect(result.categoryPath).toEqual(expect.arrayContaining(['中毒', '神经系统']))
  })
})
