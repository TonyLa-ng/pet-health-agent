const CLAUSE_BOUNDARY = '，。,.；;！!？?\\n'

const POSITIVE_NEGATION_PHRASES = [
  '没精神',
  '没劲',
  '不吃',
  '不喝',
  '不爱动',
  '不动',
  '不活跃',
  '不出来',
  '不排便',
  '尿不出',
  '站不起来',
  '无法站立',
  '不能站',
]

const TERM_ALIASES: Record<string, string[]> = {
  呕吐: ['呕吐', '吐', '吐了', '干呕', '反胃', '吐东西', '吐黄水', '吐白沫'],
  剧烈呕吐: ['剧烈呕吐', '持续呕吐', '反复呕吐', '一直吐', '不停吐', '反复吐', '吐了好几次', '喝水即吐'],
  腹泻: ['腹泻', '拉稀', '拉肚子', '窜稀', '水样便', '软便'],
  发热: ['发热', '发烧', '高烧', '低烧', '体温高', '身上热', '耳朵烫'],
  排便带血: ['排便带血', '血便', '便血', '拉血', '大便带血', '便便有血', '带血', '黑便', '柏油便'],
  血便: ['血便', '便血', '拉血', '大便带血', '便便有血', '带血', '黑便', '柏油便'],
  黑便: ['黑便', '柏油便', '酱油色便'],
  腥臭: ['腥臭', '臭味', '特别臭', '腐败臭'],
  脱水: ['脱水', '眼窝下陷', '皮肤回弹慢', '牙龈干', '口腔干'],
  抽搐: ['抽搐', '抽筋', '痉挛', '口吐白沫'],
  呼吸困难: ['呼吸困难', '张口呼吸', '喘不上气', '憋气'],
  无尿: ['无尿', '尿不出', '没有尿', '排不出尿', '尿闭'],
  尿不出: ['尿不出', '排不出尿', '无法排尿', '没有尿', '无尿', '尿闭'],
}

export function isNegatedTerm(text: string, term: string): boolean {
  const normalizedText = normalizeText(text)
  const aliases = aliasesFor(term)

  return aliases.some((alias) => {
    if (!alias || isPositiveNegationPhrase(alias)) return false
    if (!normalizedText.includes(alias)) return false

    const escaped = escapeRegExp(alias)
    const negBefore = new RegExp(
      `(?:并没有|没有出现|没有|暂时没有|目前没有|未见|未出现|未|无|没|不)[^${CLAUSE_BOUNDARY}]{0,8}${escaped}`
    )
    const negBloodShape = new RegExp(
      `(?:不|没|没有|无)[^${CLAUSE_BOUNDARY}]{0,4}(?:带血|出血|拉血|便血|血便|黑便)`
    )

    return negBefore.test(normalizedText) || (/血|便/.test(alias) && negBloodShape.test(normalizedText))
  })
}

export function containsAffirmedTerm(text: string, term: string): boolean {
  const normalizedText = normalizeText(text)
  return aliasesFor(term).some((alias) => {
    if (!alias) return false
    return normalizedText.includes(alias) && !isNegatedTerm(normalizedText, alias)
  })
}

export function hasAffirmedAny(text: string, terms: string[]): boolean {
  return terms.some((term) => containsAffirmedTerm(text, term))
}

export function filterNegatedTerms(text: string, terms: string[]): string[] {
  return terms.filter((term) => !isNegatedTerm(text, term))
}

function aliasesFor(term: string): string[] {
  const normalized = normalizeTerm(term)
  const aliases = new Set<string>([normalized])

  for (const [key, values] of Object.entries(TERM_ALIASES)) {
    if (normalized === key) {
      aliases.add(key)
      for (const value of values) aliases.add(value)
    }
  }

  return Array.from(aliases).filter((value) => value.length >= 1)
}

function normalizeTerm(term: string): string {
  return term
    .replace(/[（(].*?[）)]/g, '')
    .replace(/\s+/g, '')
    .trim()
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, '')
}

function isPositiveNegationPhrase(term: string): boolean {
  return POSITIVE_NEGATION_PHRASES.some((phrase) => term.startsWith(phrase))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
