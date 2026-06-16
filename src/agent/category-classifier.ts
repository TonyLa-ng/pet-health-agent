import type { KnowledgeEntry } from '@/knowledge/types'

export type ConsultationRouteSpecies = '犬' | '猫' | '兔' | '仓鼠'

export interface CategoryClassifierPet {
  gender?: 'male' | 'female' | 'unknown'
  neutered?: boolean
}

export interface CategoryClassificationInput {
  species: ConsultationRouteSpecies
  symptoms: string[]
  rawText: string
  pet?: CategoryClassifierPet
}

export interface CategoryClassification {
  categoryPath: string[]
  matchedRules: string[]
  scoreByCategory: Record<string, number>
  evidence: string[]
  isFallback: boolean
  text: string
}

interface CategoryRule {
  label: string
  pattern: RegExp
  categories: string[]
}

const CHIEF_CATEGORY_RULES: CategoryRule[] = [
  {
    label: 'digestive',
    pattern: /腹泻|拉稀|拉肚子|软便|水样便|血便|黑便|呕吐|吐|便秘|腹痛|肚子疼/,
    categories: ['内科', '消化系统', '传染病', '寄生虫病', '中毒'],
  },
  {
    label: 'urinary',
    pattern: /尿|排尿|尿血|尿频|尿不出|尿闭|猫砂盆/,
    categories: ['内科', '泌尿系统', '中毒'],
  },
  {
    label: 'respiratory',
    pattern: /咳嗽|喷嚏|鼻涕|呼吸|喘|张口呼吸|气喘/,
    categories: ['内科', '呼吸系统', '心血管', '传染病', '中毒'],
  },
  {
    label: 'skin',
    pattern: /皮肤|痒|挠|舔|掉毛|脱毛|红疹|疙瘩|耳朵|眼睛/,
    categories: ['皮肤科', '寄生虫病', '耳科', '眼科', '内分泌'],
  },
  {
    label: 'neuro',
    pattern: /抽搐|癫痫|倒地|瘫|站不稳|虚弱|昏迷/,
    categories: ['内科', '神经系统', '中毒', '传染病', '心血管'],
  },
  {
    label: 'ortho',
    pattern: /跛|瘸|腿疼|不敢着地|骨折|关节|外伤|伤口/,
    categories: ['外科', '骨骼肌肉', '传染病'],
  },
]

export const ENTRY_CATEGORY_TO_ROUTE: Record<string, string[]> = {
  消化系统: ['内科', '消化系统'],
  传染病: ['传染病'],
  寄生虫: ['寄生虫病', '内科'],
  中毒: ['中毒', '急诊'],
  产科: ['妇科/产科', '生殖系统'],
  泌尿系统: ['内科', '泌尿系统'],
  呼吸系统: ['内科', '呼吸系统'],
  心血管: ['内科', '心血管'],
  皮肤科: ['皮肤科'],
  耳科: ['耳科'],
  眼科: ['眼科'],
  神经系统: ['内科', '神经系统'],
  骨骼肌肉: ['外科', '骨骼肌肉'],
  口腔: ['口腔'],
  血液: ['内科', '血液'],
  内分泌: ['内科', '内分泌'],
}

const INFECTIOUS_EXPOSURE_PATTERN = /接触|别的动物|其他动物|病犬|病猫|宠物店|犬舍|猫舍|寄养|流浪|没打完疫苗|未完成|没打疫苗|疫苗/
const TOXIN_EXPOSURE_PATTERN = /吃了|偷吃|误食|翻垃圾|垃圾桶|巧克力|葡萄|洋葱|大蒜|防冻液|老鼠药|百合|人用药|毒/
const REPRODUCTIVE_PATTERN = /未绝育|发情|交配|怀孕|产后|分娩|阴道|外阴|乳腺|难产/

export function classifyCategoryPath(input: CategoryClassificationInput): CategoryClassification {
  const text = buildCategoryText(input.symptoms, input.rawText)
  const scoreByCategory: Record<string, number> = {}
  const matchedRules: string[] = []
  const evidence: string[] = []

  for (const rule of CHIEF_CATEGORY_RULES) {
    if (!rule.pattern.test(text)) continue
    matchedRules.push(rule.label)
    evidence.push(rule.label)
    addCategories(scoreByCategory, rule.categories)
  }

  if (isInfectiousExposure(text)) {
    scoreByCategory.传染病 = (scoreByCategory.传染病 || 0) + 2
    evidence.push('infectious_exposure')
  }

  if (isToxinExposure(text)) {
    scoreByCategory.中毒 = (scoreByCategory.中毒 || 0) + 2
    evidence.push('toxin_exposure')
  }

  const isFemaleScope =
    input.pet?.gender === 'female' &&
    input.pet.neutered !== true &&
    (/腹泻|呕吐|精神|发热|食欲|腹痛|虚弱/.test(text) || isReproductiveSignal(text))

  if (isFemaleScope || isReproductiveSignal(text)) {
    addCategories(scoreByCategory, ['妇科/产科', '生殖系统'])
    evidence.push('reproductive_scope')
  }

  const categoryPath = Object.entries(scoreByCategory)
    .sort(([leftCategory, leftScore], [rightCategory, rightScore]) => {
      if (rightScore !== leftScore) return rightScore - leftScore
      return categoryPriority(rightCategory) - categoryPriority(leftCategory)
    })
    .map(([category]) => category)

  if (categoryPath.length === 0) {
    return {
      categoryPath: ['内科'],
      matchedRules,
      scoreByCategory: { 内科: 1 },
      evidence,
      isFallback: true,
      text,
    }
  }

  return {
    categoryPath: prioritizeCategoryPath(categoryPath, text),
    matchedRules,
    scoreByCategory,
    evidence,
    isFallback: false,
    text,
  }
}

export function isEntryInCategoryPath(entry: KnowledgeEntry, categoryPath: string[]): boolean {
  const effectivePath = categoryPath.some((category) => !['内科', '外科'].includes(category))
    ? categoryPath.filter((category) => !['内科', '外科'].includes(category))
    : categoryPath
  const entryRoutes = new Set([
    ...(ENTRY_CATEGORY_TO_ROUTE[entry.category] || []),
    ...(entry.category_path || []),
    entry.category,
  ])

  return effectivePath.some((category) => entryRoutes.has(category)) ||
    (entry.category === '寄生虫' && categoryPath.includes('寄生虫病')) ||
    (entry.category === '产科' && categoryPath.includes('妇科/产科'))
}

export function isInfectiousExposure(text: string): boolean {
  return INFECTIOUS_EXPOSURE_PATTERN.test(text)
}

export function isToxinExposure(text: string): boolean {
  return TOXIN_EXPOSURE_PATTERN.test(text)
}

export function isReproductiveSignal(text: string): boolean {
  return REPRODUCTIVE_PATTERN.test(text)
}

export function buildCategoryText(symptoms: string[], rawText: string): string {
  return `${rawText} ${symptoms.join(' ')}`.toLowerCase()
}

function addCategories(scoreByCategory: Record<string, number>, categories: string[]): void {
  for (const category of categories) {
    scoreByCategory[category] = (scoreByCategory[category] || 0) + 1
  }
}

function prioritizeCategoryPath(categories: string[], text: string): string[] {
  const ordered = [...categories]
  if (isInfectiousExposure(text) && ordered.includes('传染病')) {
    ordered.splice(ordered.indexOf('传染病'), 1)
    ordered.unshift('传染病')
  }
  if (isToxinExposure(text) && ordered.includes('中毒')) {
    ordered.splice(ordered.indexOf('中毒'), 1)
    ordered.unshift('中毒')
  }
  return unique(ordered)
}

function categoryPriority(category: string): number {
  const priority: Record<string, number> = {
    中毒: 90,
    传染病: 80,
    急诊: 75,
    消化系统: 70,
    泌尿系统: 70,
    呼吸系统: 70,
    神经系统: 70,
    妇科: 65,
    '妇科/产科': 65,
    寄生虫病: 60,
    内科: 40,
    外科: 40,
  }
  return priority[category] || 0
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}
