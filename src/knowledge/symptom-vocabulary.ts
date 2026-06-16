// ============================================
// 共享症状词汇表 — 前后端对齐的单一真相源
//
// 用途：
//   1. 前端 kbMatch 正则生成
//   2. 前端症状分类变量 (hasSkin/hasEye/…)
//   3. 后端 normalizer CHIEF_SYMPTOM_TYPES 校验
//   4. 后端知识库检索关键词范围定义
//
// 修改此文件 = 前后端同步更新
// ============================================

// ---- 症状类别分组 ----

/** 消化系统症状 */
export const DIGESTIVE_SYMPTOMS = [
  '呕吐', '腹泻', '食欲下降', '食欲增加', '腹痛', '便秘',
  '不排便', '排便带血', '流口水', '腹部胀大',
] as const

/** 泌尿系统症状 */
export const URINARY_SYMPTOMS = [
  '排尿困难', '尿频', '血尿', '排尿行为异常', '排尿频率异常',
  '排尿带血', '多尿', '乱尿',
] as const

/** 皮肤科症状 */
export const SKIN_SYMPTOMS = [
  '瘙痒', '脱毛', '皮肤异常', '过度舔舐', '皮肤红斑',
  '皮肤脓疱', '皮屑', '结痂', '皮肤增厚', '色素沉着',
] as const

/** 眼科症状 */
export const EYE_SYMPTOMS = [
  '结膜炎', '眼部分泌物', '眼红', '眼肿', '流泪', '眯眼',
] as const

/** 耳科症状 */
export const EAR_SYMPTOMS = [
  '耳部异常', '耳臭', '耳垢', '甩头', '挠耳',
] as const

/** 骨科症状 */
export const ORTHOPEDIC_SYMPTOMS = [
  '跛行', '关节肿胀', '腿疼', '不敢着地',
] as const

/** 口腔科症状 */
export const DENTAL_SYMPTOMS = [
  '口臭', '牙龈炎', '牙龈出血', '牙结石',
] as const

/** 神经系统症状 */
export const NEURO_SYMPTOMS = [
  '抽搐', '痉挛', '虚弱', '休克', '昏迷', '共济失调',
] as const

/** 呼吸系统症状 */
export const RESPIRATORY_SYMPTOMS = [
  '咳嗽', '打喷嚏', '流鼻涕', '呼吸困难', '张口呼吸', '打鼾',
] as const

/** 全身/非特异性症状 */
export const SYSTEMIC_SYMPTOMS = [
  '发热', '精神萎靡', '体重下降', '体重增加', '多饮',
  '脱水', '黄疸', '食欲下降', '食欲增加',
] as const

/** 急症信号 */
export const EMERGENCY_SYMPTOMS = [
  '呼吸困难', '张口呼吸', '舌头发紫', '牙龈发绀', '窒息',
  '意识丧失', '昏厥', '休克', '大出血', '血流不止',
  '车祸', '高空坠落', '严重创伤', '骨折',
  '吐血', '持续抽搐', '抽搐不止',
  '完全尿不出', '超过24小时无尿',
  '老鼠药', '农药', '防冻液',
  '腹部急剧胀大', '胃扭转',
  '难产',
] as const

// ---- 前端正则生成 ----

/** 所有标准症状词汇（去重、排序） */
export const ALL_STANDARD_SYMPTOMS: readonly string[] = [
  ...new Set([
    ...DIGESTIVE_SYMPTOMS,
    ...URINARY_SYMPTOMS,
    ...SKIN_SYMPTOMS,
    ...EYE_SYMPTOMS,
    ...EAR_SYMPTOMS,
    ...ORTHOPEDIC_SYMPTOMS,
    ...DENTAL_SYMPTOMS,
    ...NEURO_SYMPTOMS,
    ...RESPIRATORY_SYMPTOMS,
    ...SYSTEMIC_SYMPTOMS,
  ]),
]

/**
 * 从同义词表扩展为用户口语正则串
 * 合并标准术语 + 所有同义词，生成前端 kbMatch 正则
 *
 * @param synonymMappings - 同义词表 { 标准术语: [同义词...] }
 * @returns 正则字符串（不含 // 包裹符）
 */
export function buildKbMatchPattern(
  synonymMappings: Record<string, string[]>
): string {
  const allTerms = new Set<string>()

  // 所有标准术语
  for (const term of ALL_STANDARD_SYMPTOMS) {
    allTerms.add(term)
  }

  // 所有同义词
  for (const synonyms of Object.values(synonymMappings)) {
    for (const syn of synonyms) {
      // 过滤过短的单字（容易误匹配）
      if (syn.length >= 2) {
        allTerms.add(syn)
      }
    }
  }

  // 按长度降序排列（长词优先匹配）
  return Array.from(allTerms)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
}

/**
 * 转义正则特殊字符
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---- 症状类别判定辅助 ----

/** 根据症状名称返回所属类别 */
export function categorizeSymptom(
  symptom: string
): 'digestive' | 'urinary' | 'skin' | 'eye' | 'ear' | 'orthopedic' | 'dental' | 'neuro' | 'respiratory' | 'systemic' | 'unknown' {
  if ((DIGESTIVE_SYMPTOMS as readonly string[]).includes(symptom)) return 'digestive'
  if ((URINARY_SYMPTOMS as readonly string[]).includes(symptom)) return 'urinary'
  if ((SKIN_SYMPTOMS as readonly string[]).includes(symptom)) return 'skin'
  if ((EYE_SYMPTOMS as readonly string[]).includes(symptom)) return 'eye'
  if ((EAR_SYMPTOMS as readonly string[]).includes(symptom)) return 'ear'
  if ((ORTHOPEDIC_SYMPTOMS as readonly string[]).includes(symptom)) return 'orthopedic'
  if ((DENTAL_SYMPTOMS as readonly string[]).includes(symptom)) return 'dental'
  if ((NEURO_SYMPTOMS as readonly string[]).includes(symptom)) return 'neuro'
  if ((RESPIRATORY_SYMPTOMS as readonly string[]).includes(symptom)) return 'respiratory'
  if ((SYSTEMIC_SYMPTOMS as readonly string[]).includes(symptom)) return 'systemic'
  return 'unknown'
}
