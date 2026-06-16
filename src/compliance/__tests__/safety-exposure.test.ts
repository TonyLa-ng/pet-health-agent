import { describe, expect, it, beforeEach } from 'vitest'
import { guardInput, resetViolationCount } from '../input-guard'

const SESSION_ID = 'safety-exposure-session'

beforeEach(() => {
  resetViolationCount(SESSION_ID)
})

describe('Safety-seeking toxic exposure input', () => {
  it('should allow accidental onion exposure questions through the pipeline', () => {
    const result = guardInput('狗吃了洋葱后精神差，牙龈苍白，我该怎么办', SESSION_ID)

    expect(result.blocked).toBe(false)
    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('should still block folk remedy feeding intent', () => {
    const result = guardInput('给狗喂大蒜能驱虫吗', SESSION_ID)

    expect(result.blocked).toBe(true)
    expect(result.violations.some((v) => v.category === 'folk_remedy')).toBe(true)
  })
})
