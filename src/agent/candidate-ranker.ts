import type { KnowledgeEntry, StructuredRuleOut } from '@/knowledge/types'
import { containsAffirmedTerm, hasAffirmedAny, isNegatedTerm } from './negation'
import { getConsultationConfig, type ConsultationConfig } from './consultation-config'
import { isEntryInCategoryPath, type ConsultationRouteSpecies } from './category-classifier'

export type Species = ConsultationRouteSpecies

export interface RankCandidatesInput {
  species: Species
  entries: KnowledgeEntry[]
  symptoms: string[]
  rawText: string
  categoryPath: string[]
  maxCandidates?: number
}

export interface CandidateCoherenceInput {
  entry: KnowledgeEntry
  symptoms: string[]
  rawText: string
  categoryPath: string[]
}

export interface CandidateCoherence {
  score: number
  categoryScore: number
  symptomCoverage: number
  keySymptomScore: number
  riskFactorScore: number
  counterEvidencePenalty: number
  matchedSymptoms: string[]
  matchedRiskFactors: string[]
  explicitCounterEvidence: string[]
  reason: string
}

export interface RankedDiseaseCandidate {
  entry: KnowledgeEntry
  disease: string
  score: number
  coherence: CandidateCoherence
  matchedCore: string[]
  matchedSecondary: string[]
  deniedCore: string[]
  deniedSecondary: string[]
  missingCore: string[]
  matchedRisks: string[]
  trace: string[]
  reason: string
}

export function rankCandidates(input: RankCandidatesInput): RankedDiseaseCandidate[] {
  return input.entries
    .filter((entry) => entry.species.includes(input.species))
    .map((entry) => rankSingleCandidate({
      entry,
      symptoms: input.symptoms,
      rawText: input.rawText,
      categoryPath: input.categoryPath,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, input.maxCandidates ?? input.entries.length)
}

export function rankSingleCandidate(input: CandidateCoherenceInput): RankedDiseaseCandidate {
  const config = getConsultationConfig(input.entry.species.includes('猫') ? '猫' : '犬')
  const text = buildText(input.symptoms, input.rawText)
  const entrySymptoms = input.entry.entry_symptoms || [
    ...input.entry.symptoms.primary,
    ...input.entry.symptoms.secondary,
  ]

  const matchedSymptoms = unique(entrySymptoms
    .filter((symptom) => symptomMatches(symptom, text, input.symptoms)))

  const matchedCore = unique((input.entry.key_symptoms || [])
    .filter((symptom) => symptom.weight === 'core')
    .filter((symptom) => symptomMatches(symptom.term, text, input.symptoms))
    .map((symptom) => symptom.term))
  const matchedSecondary = unique((input.entry.key_symptoms || [])
    .filter((symptom) => symptom.weight !== 'core')
    .filter((symptom) => symptomMatches(symptom.term, text, input.symptoms))
    .map((symptom) => symptom.term))
  const deniedCore = unique((input.entry.key_symptoms || [])
    .filter((symptom) => symptom.weight === 'core')
    .filter((symptom) => symptomDenied(symptom.term, text))
    .map((symptom) => symptom.term))
  const deniedSecondary = unique((input.entry.key_symptoms || [])
    .filter((symptom) => symptom.weight !== 'core')
    .filter((symptom) => symptomDenied(symptom.term, text))
    .map((symptom) => symptom.term))
  const missingCore = unique((input.entry.key_symptoms || [])
    .filter((symptom) => symptom.weight === 'core')
    .filter((symptom) => !matchedCore.includes(symptom.term) && !deniedCore.includes(symptom.term))
    .map((symptom) => symptom.term))

  const primaryHits = input.entry.symptoms.primary.filter((symptom) =>
    matchedSymptoms.includes(symptom) || symptomMatches(symptom, text, input.symptoms)
  ).length
  const keyHits = (input.entry.key_symptoms || [])
    .filter((symptom) => symptomMatches(symptom.term, text, input.symptoms))
    .reduce((sum, symptom) => sum + keyWeightToPoints(symptom.weight, config), 0)

  const categoryScore = isEntryInCategoryPath(input.entry, input.categoryPath) ? config.candidate.categoryHit : 0
  const symptomCoverage = matchedSymptoms.length > 0
    ? Math.min(
        config.candidate.symptomCoverageCap,
        primaryHits * config.candidate.primarySymptomHit +
          Math.max(0, matchedSymptoms.length - primaryHits) * config.candidate.secondarySymptomHit
      )
    : 0
  const keySymptomScore = Math.min(config.candidate.keySymptomScoreCap, keyHits)
  const matchedRiskFactors = (input.entry.risk_factors || []).filter((factor) =>
    factor.positive.some((positive) => looseIncludes(text, positive)) ||
    looseIncludes(text, factor.factor)
  )
  const riskFactorScore = Math.min(
    config.candidate.riskFactorScoreCap,
    matchedRiskFactors.reduce((sum, factor) => sum + riskWeightToPoints(factor.weight, config), 0)
  )

  const explicitCounterEvidence = collectExplicitCounterEvidence(input.entry.rule_out || [], text)
  const ruleOutPenalty = explicitCounterEvidence.reduce((sum, evidence) => {
    const rule = (input.entry.rule_out || []).find((item) => item.evidence === evidence)
    return sum + penaltyToPoints(rule?.penalty || 'minor', config)
  }, 0)

  const deniedKeyPenalty =
    deniedCore.length * config.candidate.negativeCorePenalty +
    deniedSecondary.length * config.candidate.negativeSecondaryPenalty
  const unrelatedPenalty =
    calculateUnrelatedPenalty(input.entry, text, input.categoryPath, matchedSymptoms) +
    calculateToxinMismatchPenalty(input.entry, text)
  const missingKeyPenalty = calculateMissingKeyPenalty(input.entry, text, matchedSymptoms)
  const counterEvidencePenalty = Math.min(
    config.candidate.counterEvidencePenaltyCap,
    ruleOutPenalty + unrelatedPenalty + missingKeyPenalty + deniedKeyPenalty
  )

  const urgencyReserve = input.entry.urgency === 'critical' && categoryScore > 0 ? config.candidate.urgentCategoryReserve : 0
  const diseaseSpecificBoost = calculateDiseaseSpecificBoost(input.entry, text)
  const rawScore =
    categoryScore +
    symptomCoverage +
    keySymptomScore +
    riskFactorScore +
    urgencyReserve +
    diseaseSpecificBoost -
    counterEvidencePenalty
  const score = clamp(Math.round(rawScore), 0, 100)

  const trace = buildTrace({
    categoryScore,
    symptomCoverage,
    keySymptomScore,
    riskFactorScore,
    counterEvidencePenalty,
    diseaseSpecificBoost,
    matchedSymptoms,
    matchedRiskFactors: matchedRiskFactors.map((factor) => factor.factor),
    matchedCore,
    deniedCore,
    deniedSecondary,
    missingCore,
    explicitCounterEvidence,
    unrelatedPenalty,
  })
  const reason = trace.join('；') || '症状相关性较弱，需继续追问'
  const coherence: CandidateCoherence = {
    score,
    categoryScore,
    symptomCoverage,
    keySymptomScore,
    riskFactorScore,
    counterEvidencePenalty,
    matchedSymptoms,
    matchedRiskFactors: matchedRiskFactors.map((factor) => factor.factor),
    explicitCounterEvidence,
    reason,
  }

  return {
    entry: input.entry,
    disease: input.entry.disease,
    score,
    coherence,
    matchedCore,
    matchedSecondary,
    deniedCore,
    deniedSecondary,
    missingCore,
    matchedRisks: coherence.matchedRiskFactors,
    trace,
    reason,
  }
}

function buildTrace(input: {
  categoryScore: number
  symptomCoverage: number
  keySymptomScore: number
  riskFactorScore: number
  counterEvidencePenalty: number
  diseaseSpecificBoost: number
  matchedSymptoms: string[]
  matchedRiskFactors: string[]
  matchedCore: string[]
  deniedCore: string[]
  deniedSecondary: string[]
  missingCore: string[]
  explicitCounterEvidence: string[]
  unrelatedPenalty: number
}): string[] {
  const trace: string[] = []
  if (input.categoryScore > 0) trace.push(`大类命中 +${input.categoryScore}`)
  if (input.matchedSymptoms.length > 0) {
    trace.push(`命中症状: ${input.matchedSymptoms.slice(0, 5).join('、')} +${input.symptomCoverage}`)
  }
  if (input.matchedCore.length > 0) {
    trace.push(`命中核心症状: ${input.matchedCore.slice(0, 4).join('、')} +${input.keySymptomScore}`)
  }
  if (input.matchedRiskFactors.length > 0) {
    trace.push(`风险因素: ${input.matchedRiskFactors.join('、')} +${input.riskFactorScore}`)
  }
  if (input.diseaseSpecificBoost > 0) trace.push(`疾病特异组合证据 +${input.diseaseSpecificBoost}`)
  if (input.deniedCore.length > 0) trace.push(`核心反证: ${input.deniedCore.join('、')}`)
  if (input.deniedSecondary.length > 0) trace.push(`辅助反证: ${input.deniedSecondary.join('、')}`)
  if (input.explicitCounterEvidence.length > 0) {
    trace.push(`反证: ${input.explicitCounterEvidence.slice(0, 3).join('；')}`)
  }
  if (input.missingCore.length > 0) trace.push(`缺失核心症状: ${input.missingCore.slice(0, 4).join('、')}`)
  if (input.unrelatedPenalty > 0) trace.push(`主诉与疾病系统不相关，降权 -${input.unrelatedPenalty}`)
  if (input.counterEvidencePenalty > 0) trace.push(`总反证降权 -${input.counterEvidencePenalty}`)
  return trace
}

function calculateDiseaseSpecificBoost(entry: KnowledgeEntry, text: string): number {
  if (entry.id === 'feline-par-003') {
    const hasTapewormSegment = /米粒|节片|白色.*颗粒|白色.*小段|会动.*白|绦虫/.test(text)
    const hasParasiteContext = /粪便|大便|便便|肛周|屁股|驱虫|跳蚤|消瘦|体重下降|被毛/.test(text)
    if (hasTapewormSegment && hasParasiteContext) return 38
    if (hasTapewormSegment) return 28
    return 0
  }

  if (entry.id !== 'canine-inf-001') return 0

  const hasParvoBlood = hasAffirmedAny(text, ['番茄', '番茄酱', '血便', '便血', '拉血', '黑便', '酱油色'])
  const hasFoulStool = hasAffirmedAny(text, ['腥臭', '特别臭', '腐败臭', '臭味'])
  const hasRepeatedVomiting = hasAffirmedAny(text, ['反复呕吐', '吐了好几次', '一直吐', '不停吐', '喝水即吐', '喝水也吐'])
  const hasInfectiousRisk = /未完成|没打完|没打疫苗|还没打完|只打|免疫空白|接触|别的动物|其他动物|病犬|宠物店|犬舍|寄养/.test(text)

  let boost = 0
  if (hasParvoBlood && hasFoulStool) boost += 28
  if (hasParvoBlood && hasRepeatedVomiting) boost += 18
  if (hasFoulStool && hasRepeatedVomiting) boost += 10
  if (hasInfectiousRisk) boost += 8

  return Math.min(42, boost)
}

function collectExplicitCounterEvidence(ruleOut: StructuredRuleOut[], text: string): string[] {
  const evidence: string[] = []
  for (const rule of ruleOut) {
    if (rule.negative.some((negative) => looseIncludes(text, negative) || explicitNegativePattern(text, negative))) {
      evidence.push(rule.evidence)
    }
  }
  return unique(evidence)
}

function calculateUnrelatedPenalty(
  entry: KnowledgeEntry,
  text: string,
  categoryPath: string[],
  matchedSymptoms: string[]
): number {
  const config = getConsultationConfig(entry.species.includes('猫') ? '猫' : '犬')
  if (matchedSymptoms.length > 0) return 0
  if (isEntryInCategoryPath(entry, categoryPath)) return config.candidate.sameCategoryUnrelatedPenalty

  const chiefIsDigestive = /腹泻|拉稀|拉肚子|呕吐|血便|软便/.test(text)
  if (chiefIsDigestive && !/(消化系统|传染病|寄生虫|中毒|产科)/.test(entry.category)) {
    return config.candidate.unrelatedPenalty
  }

  return config.candidate.genericUnrelatedPenalty
}

function calculateToxinMismatchPenalty(entry: KnowledgeEntry, text: string): number {
  if (entry.category !== '中毒') return 0

  const mentionedToxins = toxinTermsInText(text)
  const entryToxins = toxinTermsForEntry(entry)
  const hasSpecificEntryToxin = entryToxins.some((term) => containsAffirmedTerm(text, term))

  if (hasSpecificEntryToxin) return 0
  if (mentionedToxins.length > 0) return 48

  const onlyGenericDigestive = /腹泻|拉稀|拉肚子|呕吐|吐|软便/.test(text) &&
    !/(误食|误吃|偷吃|吞了|舔了|接触|毒|药|巧克力|葡萄|洋葱|大蒜|木糖醇|防冻液|百合|老鼠药|鼠药)/.test(text)
  return onlyGenericDigestive ? 40 : 0
}

function toxinTermsForEntry(entry: KnowledgeEntry): string[] {
  const text = `${entry.disease} ${entry.diagnosis_basis} ${entry.home_care}`
  const terms: string[] = []
  if (/巧克力|可可/.test(text)) terms.push('巧克力', '可可')
  if (/洋葱|大蒜/.test(text)) terms.push('洋葱', '大蒜')
  if (/葡萄|葡萄干/.test(text)) terms.push('葡萄', '葡萄干')
  if (/木糖醇|口香糖|无糖/.test(text)) terms.push('木糖醇', '口香糖', '无糖')
  if (/防冻液|乙二醇/.test(text)) terms.push('防冻液', '乙二醇')
  if (/百合/.test(text)) terms.push('百合')
  if (/老鼠药|鼠药|灭鼠药|抗凝血灭鼠药/.test(text)) terms.push('老鼠药', '鼠药', '灭鼠药')
  return terms
}

function toxinTermsInText(text: string): string[] {
  return ['巧克力', '可可', '洋葱', '大蒜', '葡萄', '葡萄干', '木糖醇', '口香糖', '无糖', '防冻液', '乙二醇', '百合', '老鼠药', '鼠药', '灭鼠药']
    .filter((term) => containsAffirmedTerm(text, term))
}

function calculateMissingKeyPenalty(entry: KnowledgeEntry, text: string, matchedSymptoms: string[]): number {
  if (entry.id !== 'canine-inf-001') return 0

  let penalty = 0
  if (/没有发烧|无发热|不发烧/.test(text)) penalty += 6
  if (/没有血便|无血便|没拉血|不带血/.test(text)) penalty += 12
  if (/没有腥臭|无腥臭|不臭|没臭味/.test(text)) penalty += 12
  if (/已完成.*疫苗|疫苗.*打完|完成基础免疫/.test(text)) penalty += 8
  if (matchedSymptoms.length <= 1 && /成年/.test(text)) penalty += 6
  return penalty
}

export function symptomMatches(symptom: string, text: string, symptoms: string[]): boolean {
  if (symptoms.includes(symptom) && !isNegatedTerm(text, symptom)) return true
  if (looseIncludes(text, symptom)) return true

  const normalized = normalizeDiseaseTerm(symptom)
  if (normalized && containsAffirmedTerm(text, normalized)) return true

  if (/血便|番茄|黑便/.test(symptom)) return hasAffirmedAny(text, ['血便', '拉血', '便血', '番茄', '黑便', '柏油'])
  if (/腥臭/.test(symptom)) return hasAffirmedAny(text, ['腥臭', '特别臭', '腐败臭', '臭味'])
  if (/呕吐|干呕/.test(symptom)) return hasAffirmedAny(text, ['呕吐', '吐', '干呕', '反胃'])
  if (/腹泻|软便|水样/.test(symptom)) return hasAffirmedAny(text, ['腹泻', '拉稀', '拉肚子', '软便', '水样', '拉水'])
  if (/食欲/.test(symptom)) return /不吃|食欲|绝食|没胃口/.test(text)
  if (/精神/.test(symptom)) return /精神|萎靡|没劲|蔫|嗜睡|虚弱/.test(text)
  if (/脱水/.test(symptom)) return /脱水|眼窝下陷|牙龈干|皮肤回弹/.test(text)
  if (/发热|高热|体温/.test(symptom)) return hasAffirmedAny(text, ['发热', '发烧', '高烧', '体温', '烫'])
  if (/弓背|腹痛/.test(symptom)) return /弓背|祈祷|肚子疼|腹痛/.test(text)
  if (/米粒|节片|绦虫/.test(symptom)) return /米粒|节片|白色.*颗粒|白色.*小段|会动.*白|绦虫/.test(text)
  if (/老鼠药|鼠药|灭鼠药/.test(symptom)) return /(老鼠药|鼠药|灭鼠药).*(吃|误食|误吃|吞|舔)|((吃|误食|误吃|吞|舔).*(老鼠药|鼠药|灭鼠药))/.test(text)
  if (/出血倾向/.test(symptom)) return /出血|血尿|血便|黑便|咳血|牙龈.*血|瘀斑|血肿|鼻血/.test(text)

  return false
}

function symptomDenied(symptom: string, text: string): boolean {
  if (isNegatedTerm(text, symptom)) return true
  if (/血便|番茄|黑便/.test(symptom)) return /(没有|无|没|不)[^，。,.；;]{0,8}(血便|便血|拉血|带血|黑便)|不带血/.test(text)
  if (/腥臭/.test(symptom)) return /(没有|无|没|不)[^，。,.；;]{0,8}(腥臭|臭味|臭)|不臭|没臭味/.test(text)
  if (/呕吐|干呕/.test(symptom)) return /(没有|无|没|不)[^，。,.；;]{0,8}(呕吐|吐|干呕)|不吐/.test(text)
  if (/发热|高热|体温/.test(symptom)) return /(没有|无|没|不)[^，。,.；;]{0,8}(发热|发烧|高烧|体温高)|不发烧/.test(text)
  if (/皮肤|瘙痒|痒/.test(symptom)) return /(没有|无|没|不)[^，。,.；;]{0,8}(皮肤|瘙痒|痒|抓挠)/.test(text)
  if (/脱毛|掉毛|秃/.test(symptom)) return /(没有|无|没|不)[^，。,.；;]{0,8}(脱毛|掉毛|秃)/.test(text)
  return false
}

function normalizeDiseaseTerm(term: string): string {
  return term
    .replace(/[（(].*?[）)]/g, '')
    .replace(/急性|慢性|剧烈|持续|频繁|显著|极度/g, '')
    .trim()
}

function looseIncludes(text: string, term: string): boolean {
  const value = term.trim()
  if (!value) return false
  if (containsAffirmedTerm(text, value)) return true
  const normalized = normalizeDiseaseTerm(value)
  return normalized.length >= 2 && containsAffirmedTerm(text, normalized)
}

function explicitNegativePattern(text: string, term: string): boolean {
  const normalized = normalizeDiseaseTerm(term)
  if (normalized.length < 2) return false
  return new RegExp(`(没有|无|没|不)[^，。,.；;]{0,6}${escapeRegExp(normalized)}`).test(text)
}

function keyWeightToPoints(weight: 'core' | 'major' | 'minor', config: ConsultationConfig): number {
  if (weight === 'core') return config.candidate.coreKeySymptomHit
  if (weight === 'major') return config.candidate.majorKeySymptomHit
  return config.candidate.minorKeySymptomHit
}

function riskWeightToPoints(weight: 'core' | 'major' | 'minor', config: ConsultationConfig): number {
  if (weight === 'core') return config.candidate.riskCoreHit
  if (weight === 'major') return config.candidate.riskMajorHit
  return config.candidate.riskMinorHit
}

function penaltyToPoints(penalty: 'critical' | 'major' | 'minor', config: ConsultationConfig): number {
  if (penalty === 'critical') return config.candidate.ruleOutCriticalPenalty
  if (penalty === 'major') return config.candidate.ruleOutMajorPenalty
  return config.candidate.ruleOutMinorPenalty
}

function buildText(symptoms: string[], rawText: string): string {
  return `${rawText} ${symptoms.join(' ')}`.toLowerCase()
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
