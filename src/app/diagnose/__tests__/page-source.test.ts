import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('diagnose page boundary', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/diagnose/page.tsx'), 'utf8')

  it('does not contain a local diagnosis brain or demo diagnosis fallback', () => {
    expect(source).not.toMatch(/handleDemoMode/)
    expect(source).not.toMatch(/generateFallbackAnalysis/)
    expect(source).not.toMatch(/Demo 模式/)
    expect(source).not.toMatch(/本地模拟/)
    expect(source).not.toMatch(/let disease\s*=/)
    expect(source).not.toMatch(/let confidence\s*=/)
    expect(source).not.toMatch(/急性胃肠炎/)
    expect(source).not.toMatch(/猫下泌尿道/)
  })
})
