// ============================================
// M3: Symptom Normalizer (症状归一化器)
// 第 0 层：过滤噪音 + 错别字纠正
// 第 1 层：同义词替换 → 标准兽医术语
// 第 2 层：症状分层（主诉/伴随/体征/时间线/环境）
// ============================================

import type { NormalizedInput, Symptom, VitalSign, Timeline } from '@/agent/types'
import { loadSynonyms, loadSpeciesConfig } from './loader'
import type { SynonymTable } from './loader'
import { extractDuration } from '@/agent/triage'
import { isNegatedTerm } from '@/agent/negation'
import type { SpeciesConfig } from './types'

/**
 * 归一化用户输入
 *
 * @param text - 原始用户输入
 * @param species - 物种
 * @returns NormalizedInput
 */
export function normalize(
  text: string,
  species: '犬' | '猫' | '兔' | '仓鼠'
): NormalizedInput {
  const synonymTable = loadSynonyms(species)
  const speciesConfig = loadSpeciesConfig(species)

  // 第 0 层：过滤噪音
  const { cleanedText, excludedNoise } = filterNoise(text)

  // 第 0 层：错别字纠正
  const correctedText = correctTypos(cleanedText)

  // 第 1 层：同义词替换 + 术语提取
  const { standardizedSymptoms, rawSymptoms } = extractAndStandardize(
    correctedText,
    synonymTable
  )

  // 第 2 层：症状分层
  const chiefComplaint = classifyChiefComplaint(standardizedSymptoms, rawSymptoms)
  const accompanyingSymptoms = classifyAccompanying(standardizedSymptoms, chiefComplaint)
  const vitalSigns = extractVitalSigns(correctedText, speciesConfig)
  const timeline = buildTimeline(correctedText)
  const environmentFactors = extractEnvironmentFactors(correctedText)

  return {
    chiefComplaint,
    accompanyingSymptoms,
    vitalSigns,
    timeline,
    environmentFactors,
    excludedNoise,
  }
}

// ---- 第 0 层：噪音过滤 ----

/** 需要过滤的噪音模式 */
const NOISE_PATTERNS = [
  /^(你好|您好|hi|hello|在吗|在不在|问一下|请问|想问|咨询一下|你好呀|您好啊|想问一下|我想问|我问一下)[，。,.\s]*/i,
  /(谢谢|多谢|感谢|辛苦了|麻烦你|拜托|谢了|谢谢啦|多谢啦)[了啦]?[。.!！]*$/i,
  /[😂😊😭😍🙏💪👍❤️😢😡🤔😅😰😱🤗]/g,
  /~(～|~~)+/g,
  /我家[的]?(狗|猫|狗狗|猫咪|主子|毛孩子|宝贝|宠物|小可爱|小家伙)/,
  /我们家[的]?(狗|猫|狗狗|猫咪|崽|毛孩子)/,
  /我[的]?那个[宠物|猫猫|狗狗]/,
  /就是|就是说|然后|嗯|呃|那个|这个|反正|其实/,
]

function filterNoise(text: string): { cleanedText: string; excludedNoise: string[] } {
  const excludedNoise: string[] = []
  let cleaned = text

  for (const pattern of NOISE_PATTERNS) {
    const match = cleaned.match(pattern)
    if (match) {
      excludedNoise.push(match[0])
      cleaned = cleaned.replace(pattern, '').trim()
    }
  }

  return { cleanedText: cleaned, excludedNoise }
}

// ---- 第 0 层：错别字纠正 ----

/** 常见错别字映射 */
const TYPO_CORRECTIONS: Record<string, string> = {
  '狗狗': '', // 去掉叠词化表述
  '猫咪': '',
  '窜希': '腹泻',
  '拉希': '腹泻',
  '啦稀': '腹泻',
  '偶吐': '呕吐',
  '欧吐': '呕吐',
  '废炎': '肺炎',
  '废焱': '肺炎',
  '科嗽': '咳嗽',
  '刻嗽': '咳嗽',
  '發烧': '发烧',
  '发熱': '发热',
}

function correctTypos(text: string): string {
  let corrected = text
  for (const [typo, correction] of Object.entries(TYPO_CORRECTIONS)) {
    if (correction === '') {
      corrected = corrected.replace(new RegExp(typo, 'g'), '')
    } else if (corrected.includes(typo)) {
      corrected = corrected.replace(new RegExp(typo, 'g'), correction)
    }
  }
  return corrected
}

// ---- 第 1 层：同义词替换 ----

function extractAndStandardize(
  text: string,
  synonymTable: SynonymTable
): {
  standardizedSymptoms: string[]
  rawSymptoms: string[]
} {
  const standardized = new Set<string>()
  const rawSyms: string[] = []

  // 建立反向索引：口语词 → 标准术语
  const reverseIndex = new Map<string, string>()
  for (const [standardTerm, synonyms] of Object.entries(synonymTable.mappings)) {
    for (const syn of synonyms) {
      reverseIndex.set(syn, standardTerm)
    }
    reverseIndex.set(standardTerm, standardTerm)
  }

  // 按长度降序排列（优先匹配长短语，避免"尿"比"排尿困难"先匹配）
  const sortedEntries = Array.from(reverseIndex.entries())
    .sort((a, b) => b[0].length - a[0].length)

  for (const [raw, standard] of sortedEntries) {
    if (isNegatedTerm(text, raw) || isNegatedTerm(text, standard)) continue

    // 精确匹配
    if (text.includes(raw)) {
      standardized.add(standard)
      if (!rawSyms.includes(raw)) rawSyms.push(raw)
      continue
    }

    // 短语匹配（≥4字的同义词，允许中间有插入词）
    if (raw.length >= 4) {
      if (isCompactPhraseMatch(text, raw)) {
        standardized.add(standard)
        if (!rawSyms.includes(raw)) rawSyms.push(raw)
      }
    }
  }

  return {
    standardizedSymptoms: Array.from(standardized),
    rawSymptoms: rawSyms,
  }
}

function isCompactPhraseMatch(text: string, phrase: string): boolean {
  const chars = Array.from(phrase).filter(char => char.trim().length > 0)
  if (chars.length < 4) return false

  const positions: number[] = []
  let lastPos = -1
  for (const char of chars) {
    const pos = text.indexOf(char, lastPos + 1)
    if (pos === -1) continue
    positions.push(pos)
    lastPos = pos
  }

  if (positions.length < Math.ceil(chars.length * 0.85)) return false

  const span = positions[positions.length - 1] - positions[0] + 1
  const maxSpan = Math.max(chars.length + 2, Math.ceil(chars.length * 1.5))
  return span <= maxSpan
}

// ---- 第 2 层：症状分层 ----

/** 核心主诉症状类型 — 这些通常就是主诉 */
const CHIEF_SYMPTOM_TYPES = [
  '呕吐', '腹泻', '咳嗽', '发热', '跛行', '排尿困难', '血尿',
  '抽搐', '呼吸困难', '出血', '食欲下降', '精神萎靡', '便秘',
  '尿频', '乱尿', '脱毛', '瘙痒', '体重下降',
  // 扩展
  '排尿频率异常', '排尿行为异常', '排尿带血', '排便带血',
  '结膜炎', '耳部异常', '皮肤异常', '过度舔舐', '虚弱',
  '黄疸', '腹部胀大', '休克', '不排便', '张口呼吸',
  '食欲增加', '体重增加', '口臭', '多饮', '多尿',
  '流口水', '打喷嚏', '流鼻涕', '腹痛', '跛行',
]

function classifyChiefComplaint(
  standardized: string[],
  rawSymptoms: string[]
): Symptom[] {
  const chiefs: Symptom[] = []

  for (const term of standardized) {
    // CHIEF_SYMPTOM_TYPES 中的症状默认归为主诉
    if (CHIEF_SYMPTOM_TYPES.includes(term)) {
      const raw = rawSymptoms.find(
        (r) => r === term || isSynonymOf(r, term)
      )
      chiefs.push({
        name: term,
        original: raw || term,
        category: 'chief',
      })
    }
  }

  return chiefs
}

function classifyAccompanying(
  standardized: string[],
  chiefs: Symptom[]
): Symptom[] {
  const chiefNames = new Set(chiefs.map((c) => c.name))
  const accompanying: Symptom[] = []

  for (const term of standardized) {
    if (!chiefNames.has(term)) {
      accompanying.push({
        name: term,
        original: term,
        category: 'accompanying',
      })
    }
  }

  return accompanying
}

// ---- 体征提取 ----

function extractVitalSigns(
  text: string,
  speciesConfig: SpeciesConfig
): VitalSign[] {
  const vitals: VitalSign[] = []

  // 体温提取
  const tempMatch = text.match(/(\d{2}(?:\.\d)?)\s*度/)
  if (tempMatch) {
    const value = parseFloat(tempMatch[1])
    const range = speciesConfig.normal_vitals.temperature
    vitals.push({
      type: 'temperature',
      value,
      unit: '℃',
      isAbnormal: value < range.min || value > range.max,
      normalRange: { min: range.min, max: range.max },
    })
  }

  return vitals
}

// ---- 时间线构建 ----

function buildTimeline(text: string): Timeline {
  const { bucket } = extractDuration(text)

  let onset = ''
  let frequency = ''
  let pattern: Timeline['pattern'] = 'unknown'

  // 提取发病时间描述
  const onsetMatch = text.match(
    /(?:从|自从|昨天|今天|前天|上周|几天前|刚才|刚刚)[^，。,.\n]{0,10}(?:开始|起)/
  )
  if (onsetMatch) {
    onset = onsetMatch[0]
  }

  // 提取频率描述
  if (text.includes('一直') || text.includes('不停') || text.includes('持续')) {
    pattern = 'continuous'
    frequency = '持续'
  } else if (
    text.includes('有时候') ||
    text.includes('一阵一阵') ||
    text.includes('偶尔') ||
    text.includes('间歇')
  ) {
    pattern = 'intermittent'
    frequency = '间歇性'
  } else if (
    text.includes('突然') ||
    text.includes('一下子') ||
    text.includes('猛地')
  ) {
    pattern = 'paroxysmal'
    frequency = '突发性'
  }

  return { onset, duration: bucket, frequency, pattern }
}

// ---- 环境因素提取 ----

function extractEnvironmentFactors(text: string): string[] {
  const factors: string[] = []

  const envKeywords = [
    { pattern: /换[了过]?.*粮/, label: '近期换粮' },
    { pattern: /搬家|换了.*环境|新环境/, label: '环境变化（搬家）' },
    { pattern: /新[来了养].*(狗|猫|宠物)/, label: '新增宠物' },
    { pattern: /出门|外出|遛|散步|出去玩/, label: '近期外出' },
    { pattern: /洗澡|美容|寄养|托管/, label: '近期美容/寄养' },
    { pattern: /吃了.*(骨头|剩饭|垃圾|零食|人吃)/, label: '进食非常规食物' },
    { pattern: /(翻|吃|掏|扒).*(垃圾桶|垃圾)/, label: '翻垃圾桶' },
  ]

  for (const { pattern, label } of envKeywords) {
    if (pattern.test(text)) {
      factors.push(label)
    }
  }

  return factors
}

// ---- 辅助函数 ----

function isSynonymOf(word: string, standardTerm: string): boolean {
  // 简化实现：实际应查同义词表
  return word === standardTerm || word.includes(standardTerm) || standardTerm.includes(word)
}
