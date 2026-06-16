export type ConsultSpecies = '犬' | '猫'

const DOG_ALIASES = new Set(['犬', '狗', '狗狗', '小狗', 'dog', 'dogs', 'canine', 'puppy'])
const CAT_ALIASES = new Set(['猫', '猫咪', '小猫', 'cat', 'cats', 'feline', 'kitten'])

const DOG_SUBJECT_PATTERNS = [
  /我家\s*(狗|狗狗|小狗|犬)/i,
  /家里\s*(狗|狗狗|小狗|犬)/i,
  /这只\s*(狗|狗狗|小狗|犬)/i,
  /(狗狗|小狗|公犬|母犬|幼犬)/i,
  /(狗|犬)(拉|吐|尿|咳|喘|抽|一直|不吃|没精神)/i,
  /\b(dog|puppy|canine)\b/i,
]

const CAT_SUBJECT_PATTERNS = [
  /我家\s*(猫|猫咪|小猫)/i,
  /家里\s*(猫|猫咪|小猫)/i,
  /这只\s*(猫|猫咪|小猫)/i,
  /(猫咪|小猫|公猫|母猫|幼猫)/i,
  /(猫)(拉|吐|尿|咳|喘|抽|一直|不吃|没精神)/i,
  /猫砂盆/i,
  /\b(cat|kitten|feline)\b/i,
]

export function normalizeConsultSpecies(value: unknown): ConsultSpecies | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (DOG_ALIASES.has(normalized)) return '犬'
  if (CAT_ALIASES.has(normalized)) return '猫'
  if (/^(犬|狗)/.test(normalized)) return '犬'
  if (/^猫/.test(normalized)) return '猫'
  return null
}

export function defaultDemoPetIdForSpecies(species: ConsultSpecies): string {
  return species === '猫' ? 'pet-demo-cat' : 'pet-demo-dog'
}

export function speciesDisplayName(species: ConsultSpecies | string): string {
  if (species === '猫') return '猫'
  if (species === '犬') return '犬'
  return species || '未知物种'
}

export interface SpeciesMismatch {
  expected: ConsultSpecies
  mentioned: ConsultSpecies
  message: string
}

export function detectSpeciesMismatch(text: string, expected: ConsultSpecies): SpeciesMismatch | null {
  const mentioned = detectSubjectSpecies(text)
  if (!mentioned || mentioned === expected) return null

  return {
    expected,
    mentioned,
    message: `当前在${speciesDisplayName(expected)}问诊模块，但你的描述更像是在询问${speciesDisplayName(mentioned)}。犬猫疾病知识库、急症阈值和用药禁忌不同，请切换到${speciesDisplayName(mentioned)}问诊入口；如果这次确实问的是${speciesDisplayName(expected)}，请重新描述并避免写成${speciesDisplayName(mentioned)}。`,
  }
}

function detectSubjectSpecies(text: string): ConsultSpecies | null {
  const dogSubject = DOG_SUBJECT_PATTERNS.some((pattern) => pattern.test(text))
  const catSubject = CAT_SUBJECT_PATTERNS.some((pattern) => pattern.test(text))

  if (dogSubject && !catSubject) return '犬'
  if (catSubject && !dogSubject) return '猫'
  return null
}
