import type {
  ForbiddenCareRule,
  KnowledgeEntry,
  StructuredEmergencySign,
  StructuredKeySymptom,
  StructuredRequiredTest,
  StructuredRiskFactor,
  StructuredRuleIn,
  StructuredRuleOut,
  StructuredSeverityStage,
} from './types'

type EntryUrgency = KnowledgeEntry['urgency']

const CATEGORY_PATHS: Record<string, string[]> = {
  消化系统: ['内科', '消化系统'],
  呼吸系统: ['内科', '呼吸系统'],
  泌尿系统: ['内科', '泌尿系统'],
  传染病: ['传染病'],
  寄生虫: ['内科', '寄生虫病'],
  中毒: ['急诊', '中毒'],
  产科: ['妇科/产科', '生殖系统'],
  皮肤科: ['皮肤科'],
  耳科: ['耳科'],
  眼科: ['眼科'],
  口腔: ['口腔'],
  神经系统: ['内科', '神经系统'],
  骨骼肌肉: ['外科', '骨骼肌肉'],
  心血管: ['内科', '心血管'],
  血液: ['内科', '血液'],
  内分泌: ['内科', '内分泌'],
}

const CATEGORY_TESTS: Record<string, StructuredRequiredTest[]> = {
  消化系统: [
    { test: '体格检查和腹部触诊', reason: '评估腹痛、脱水和腹部胀气风险', priority: 'required' },
    { test: '血常规+血生化+电解质', reason: '判断炎症、脱水、电解质紊乱和肝肾胰指标', priority: 'required' },
    { test: '粪便检查/寄生虫筛查', reason: '腹泻病例需排查寄生虫、出血和感染线索', priority: 'recommended' },
    { test: '腹部X光或超声', reason: '排查异物、梗阻、胰腺炎或腹腔异常', priority: 'recommended' },
  ],
  传染病: [
    { test: '血常规', reason: '评估白细胞、中性粒细胞、贫血和感染严重度', priority: 'required' },
    { test: '病原快速检测或PCR', reason: '确认病毒/细菌/寄生虫等传染源', priority: 'required' },
    { test: '血生化+电解质', reason: '评估脱水、肝肾损伤和治疗风险', priority: 'required' },
  ],
  寄生虫: [
    { test: '粪便浮集/涂片镜检', reason: '识别虫卵、球虫或贾第虫等病原', priority: 'required' },
    { test: '血常规', reason: '评估贫血、嗜酸性粒细胞变化和感染程度', priority: 'recommended' },
  ],
  中毒: [
    { test: '毒物接触史核对和毒物包装留样', reason: '锁定毒物类型并决定解毒路径', priority: 'required' },
    { test: '血常规+血生化+凝血功能+电解质', reason: '评估溶血、肝肾损伤、凝血异常和休克风险', priority: 'required' },
  ],
  产科: [
    { test: '腹部超声', reason: '评估子宫、胎儿、积液或感染情况', priority: 'required' },
    { test: '血常规+炎症指标+血生化', reason: '评估感染、贫血、脱水和手术风险', priority: 'required' },
    { test: 'X光/影像评估', reason: '难产或胎儿数量判断时辅助决策', priority: 'recommended' },
  ],
  泌尿系统: [
    { test: '尿常规+尿沉渣', reason: '评估血尿、结晶、感染和尿比重', priority: 'required' },
    { test: '血生化+电解质', reason: '排查肾损伤、高钾血症和脱水', priority: 'required' },
    { test: '泌尿系统超声或X光', reason: '排查结石、阻塞和膀胱异常', priority: 'recommended' },
  ],
  呼吸系统: [
    { test: '听诊和血氧评估', reason: '判断呼吸窘迫和缺氧程度', priority: 'required' },
    { test: '胸部X光', reason: '鉴别肺炎、气管问题、胸腔积液或心源性呼吸困难', priority: 'required' },
  ],
  皮肤科: [
    { test: '皮肤刮片/拔毛镜检', reason: '排查螨虫、真菌和表皮异常', priority: 'required' },
    { test: '真菌培养或伍德灯检查', reason: '怀疑皮肤癣菌时用于确认', priority: 'recommended' },
  ],
  耳科: [
    { test: '耳镜检查', reason: '评估耳道红肿、异物、鼓膜和分泌物', priority: 'required' },
    { test: '耳分泌物细胞学', reason: '区分耳螨、细菌、酵母菌或混合感染', priority: 'required' },
  ],
  眼科: [
    { test: '荧光素染色', reason: '排查角膜溃疡或损伤', priority: 'required' },
    { test: '眼压检查', reason: '排查青光眼或葡萄膜炎相关风险', priority: 'recommended' },
  ],
  口腔: [
    { test: '口腔检查和牙周评估', reason: '确认牙石、牙龈炎、松动牙或异物', priority: 'required' },
    { test: '口腔X光', reason: '评估牙根、牙槽骨和隐匿感染', priority: 'recommended' },
  ],
  神经系统: [
    { test: '神经学检查', reason: '定位中枢/外周神经病变', priority: 'required' },
    { test: '血糖、电解质和毒物筛查', reason: '抽搐/虚弱需先排查代谢和中毒原因', priority: 'required' },
  ],
  骨骼肌肉: [
    { test: '骨科触诊和步态评估', reason: '定位疼痛、关节不稳或软组织损伤', priority: 'required' },
    { test: 'X光检查', reason: '排查骨折、脱位、关节炎和骨病变', priority: 'required' },
  ],
  心血管: [
    { test: '心肺听诊和血压', reason: '评估心律、杂音和循环状态', priority: 'required' },
    { test: '心脏超声/心电图/胸片', reason: '鉴别心脏结构病、心律失常和肺水肿', priority: 'recommended' },
  ],
  血液: [
    { test: '血常规+血涂片', reason: '评估贫血、血小板和细胞形态', priority: 'required' },
    { test: '凝血功能和生化', reason: '鉴别出血倾向、肝病或免疫介导疾病', priority: 'required' },
  ],
  内分泌: [
    { test: '血生化+尿检', reason: '评估代谢异常、肝肾指标和尿糖/尿比重', priority: 'required' },
    { test: '专项激素检测', reason: '按疑似疾病确认甲状腺、肾上腺或糖尿病相关指标', priority: 'recommended' },
  ],
}

const DEFAULT_FORBIDDEN = [
  '禁止自行使用人用药或处方药',
  '禁止症状加重时继续居家观察',
  '禁止强行灌食、灌水或自行催吐',
]

const URGENCY_MIN_SCORE: Record<EntryUrgency, number> = {
  low: 45,
  medium: 55,
  high: 70,
  critical: 85,
}

export function enrichKnowledgeEntry(entry: KnowledgeEntry): KnowledgeEntry {
  const base = cloneEntry(entry)
  const enriched: KnowledgeEntry = {
    ...base,
    category_path: ensureCategoryPathDepth(unique([
      ...(CATEGORY_PATHS[base.category] || ['内科', base.category]),
      ...(base.category === '传染病' && hasDigestiveSigns(base) ? ['消化道传染病'] : []),
    ]), base.category),
    entry_symptoms: buildEntrySymptoms(base),
    key_symptoms: buildKeySymptoms(base),
    risk_factors: buildRiskFactors(base),
    rule_in: buildRuleIn(base),
    rule_out: buildRuleOut(base),
    severity_stages: buildSeverityStages(base),
    emergency_signs: buildEmergencySigns(base),
    required_tests: buildRequiredTests(base),
    report_profile: buildReportProfile(base),
  }

  if (base.id === 'canine-inf-001') {
    return enrichCanineParvovirus(enriched)
  }

  return enriched
}

export function enrichKnowledgeEntries(entries: KnowledgeEntry[]): KnowledgeEntry[] {
  return entries.map(enrichKnowledgeEntry)
}

function cloneEntry(entry: KnowledgeEntry): KnowledgeEntry {
  return {
    ...entry,
    species: [...entry.species],
    symptoms: {
      primary: [...entry.symptoms.primary],
      secondary: [...entry.symptoms.secondary],
      detail: { ...entry.symptoms.detail },
    },
    forbidden_care: entry.forbidden_care.map((rule) => ({ ...rule })),
    medication: [...entry.medication],
    differential_diagnosis: entry.differential_diagnosis.map((diff) => ({
      ...diff,
      key_questions: [...diff.key_questions],
    })),
    references: [...entry.references],
  }
}

function buildEntrySymptoms(entry: KnowledgeEntry): string[] {
  return unique([
    ...entry.symptoms.primary,
    ...entry.symptoms.secondary,
    ...Object.keys(entry.symptoms.detail),
  ])
}

function buildKeySymptoms(entry: KnowledgeEntry): StructuredKeySymptom[] {
  const primary = entry.symptoms.primary.map((term) => ({
    term,
    weight: 'core' as const,
    ask: `是否出现“${term}”？它是${entry.disease}的核心判定线索。`,
    supports: `支持${entry.disease}`,
  }))
  const secondary = entry.symptoms.secondary.map((term) => ({
    term,
    weight: isDiscriminativeTerm(term) ? 'major' as const : 'minor' as const,
    ask: `是否伴随“${term}”？`,
    supports: isDiscriminativeTerm(term)
      ? `这是区分${entry.disease}与相似疾病的重要线索`
      : `可辅助判断${entry.disease}`,
  }))
  return [...primary, ...secondary].slice(0, 10)
}

function buildRiskFactors(entry: KnowledgeEntry): StructuredRiskFactor[] {
  const factors: StructuredRiskFactor[] = []

  if (entry.category === '传染病') {
    factors.push(
      {
        factor: '疫苗状态',
        question: '疫苗是否未完成、超期或不确定？',
        positive: ['未完成', '没打', '只打一针', '超期', '不确定', '未知'],
        weight: 'core',
      },
      {
        factor: '接触史',
        question: '最近7-14天是否接触过病犬/病猫、宠物店、犬舍、寄养或外来动物？',
        positive: ['接触', '宠物店', '犬舍', '寄养', '流浪', '跟别的动物玩', '外来动物'],
        weight: 'core',
      }
    )
  }

  if (entry.category === '消化系统') {
    factors.push({
      factor: '饮食/异物史',
      question: '最近是否换粮、吃剩饭/腐败食物、翻垃圾桶、啃玩具或吞异物？',
      positive: ['换粮', '剩饭', '垃圾', '骨头', '异物', '玩具', '肥肉', '油炸'],
      weight: 'major',
    })
  }

  if (entry.category === '寄生虫') {
    factors.push({
      factor: '驱虫史',
      question: '最近是否超过3个月未驱虫，或粪便中见到虫体/米粒样节片？',
      positive: ['没驱虫', '超过三个月', '虫', '米粒', '节片'],
      weight: 'major',
    })
  }

  if (entry.category === '中毒') {
    factors.push({
      factor: '毒物接触',
      question: '是否误食巧克力、葡萄、洋葱、防冻液、百合、人用药或老鼠药？',
      positive: ['误食', '偷吃', '巧克力', '葡萄', '洋葱', '防冻液', '百合', '老鼠药', '人用药'],
      weight: 'core',
    })
  }

  if (entry.category === '产科') {
    factors.push({
      factor: '未绝育/妊娠产后',
      question: '是否未绝育、近期发情/交配/怀孕/分娩或有阴道分泌物？',
      positive: ['未绝育', '发情', '交配', '怀孕', '分娩', '产后', '阴道分泌物'],
      weight: 'core',
    })
  }

  return factors
}

function buildRuleIn(entry: KnowledgeEntry): StructuredRuleIn[] {
  const rules: StructuredRuleIn[] = entry.symptoms.primary.map((term) => ({
    question: `是否有${term}？`,
    positive: [term],
    weight: 'core' as const,
    evidence: `${term}是${entry.disease}的核心表现之一`,
  }))

  for (const diff of entry.differential_diagnosis) {
    for (const question of diff.key_questions) {
      rules.push({
        question,
        positive: inferPositiveKeywords(question),
        weight: 'major',
        evidence: diff.differentiator,
      })
    }
  }

  return rules.slice(0, 10)
}

function buildRuleOut(entry: KnowledgeEntry): StructuredRuleOut[] {
  const rules: StructuredRuleOut[] = entry.symptoms.primary.slice(0, 5).map((term) => ({
    question: `是否明确没有${term}？`,
    negative: [`没有${term}`, `无${term}`, `不${term}`],
    penalty: 'major',
    evidence: `缺少${entry.disease}核心表现“${term}”时，应明显降低置信度`,
  }))

  if (entry.category === '传染病') {
    rules.push({
      question: '疫苗是否已按时完成且无近期接触史？',
      negative: ['疫苗完成', '已完成基础免疫', '没有接触', '未外出'],
      penalty: 'major',
      evidence: '完成免疫且无暴露史会降低传染病概率',
    })
  }

  return rules
}

function buildSeverityStages(entry: KnowledgeEntry): StructuredSeverityStage[] {
  return [
    {
      stage: '早期/轻症观察期',
      signs: entry.symptoms.primary.slice(0, 2),
      urgency: entry.urgency === 'critical' ? 'high' : entry.urgency,
      action: '补充病史并严密观察，若症状进展需尽快就医',
    },
    {
      stage: '进展期',
      signs: unique([...entry.symptoms.primary, ...entry.symptoms.secondary]).slice(0, 5),
      urgency: entry.urgency === 'low' ? 'medium' : entry.urgency,
      action: '建议到宠物医院检查，避免自行用药掩盖病情',
    },
    {
      stage: '危重期',
      signs: criticalSignsForEntry(entry),
      urgency: 'critical',
      action: '任一危重信号出现时立即前往24小时宠物医院急诊',
    },
  ]
}

function buildEmergencySigns(entry: KnowledgeEntry): StructuredEmergencySign[] {
  const signs = criticalSignsForEntry(entry)
  return signs.map((sign) => ({
    sign,
    minTriageScore: URGENCY_MIN_SCORE[entry.urgency],
    action: entry.urgency === 'critical'
      ? '立即急诊，不建议居家观察'
      : '尽快就医并监测是否升级为急症',
  }))
}

function buildRequiredTests(entry: KnowledgeEntry): StructuredRequiredTest[] {
  const categoryTests = CATEGORY_TESTS[entry.category] || [
    { test: '体格检查', reason: '确认生命体征和病变部位', priority: 'required' },
    { test: '血常规+血生化', reason: '评估炎症、贫血、脱水和器官功能', priority: 'recommended' },
  ]
  return uniqueTests(categoryTests)
}

function buildReportProfile(entry: KnowledgeEntry) {
  const forbidden = unique([
    ...entry.forbidden_care.map(formatForbiddenCareRule),
    ...DEFAULT_FORBIDDEN,
  ])

  const careFocus = entry.home_care
    .split(/\n|；|;/)
    .map((item) => item.replace(/^\d+[.、]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5)

  return {
    care_focus: careFocus.length > 0 ? careFocus : ['观察精神、食欲、排便排尿和体温变化'],
    forbidden,
    owner_explanation: `${entry.disease}属于${entry.category}问题，需结合病史、体征和必要检查判断。`,
  }
}

function enrichCanineParvovirus(entry: KnowledgeEntry): KnowledgeEntry {
  const parvoTests: StructuredRequiredTest[] = [
    { test: 'CPV抗原快速检测', reason: '快速筛查犬细小病毒感染', priority: 'required' },
    { test: '粪便PCR', reason: '抗原结果不典型或疫苗干扰时进一步确认', priority: 'recommended' },
    { test: '血常规', reason: '评估白细胞/中性粒细胞下降和贫血风险', priority: 'required' },
    { test: '血生化+电解质+血糖', reason: '评估脱水、低血糖、电解质紊乱、肝肾灌注和输液风险', priority: 'required' },
    { test: '腹部超声或X光', reason: '怀疑肠套叠、梗阻、腹痛明显或病程恶化时排查并发症', priority: 'recommended' },
  ]

  return {
    ...entry,
    category_path: ['传染病', '消化道传染病', '急症'],
    key_symptoms: [
      { term: '剧烈呕吐', weight: 'core', ask: '是否1天呕吐3次以上，喝水也吐或空腹仍干呕？', supports: '支持犬细小肠炎型' },
      { term: '血便（番茄酱样）', weight: 'core', ask: '粪便是否番茄汁样、鲜红血便、酱油色黑血便或有肠黏膜碎片？', supports: '强支持犬细小病毒病' },
      { term: '腥臭水样腹泻', weight: 'core', ask: '粪便是否有浓烈腐败腥臭味？', supports: '强支持犬细小肠炎型' },
      { term: '快速脱水', weight: 'major', ask: '是否眼窝下陷、牙龈干冷、皮肤回弹超过2秒？', supports: '提示病程进展和急诊风险' },
      { term: '精神极度萎靡', weight: 'major', ask: '是否持续趴卧、不愿站立、唤之反应差？', supports: '提示全身情况恶化' },
      { term: '高热或低体温', weight: 'major', ask: '体温是否超过40℃，或后期低于37.5℃？', supports: '高热支持感染爆发，低体温提示休克危重' },
      { term: '心肌炎型呼吸困难', weight: 'core', ask: '40-90日龄幼犬是否突然喘气、黏膜发紫、倒地抽搐？', supports: '提示心肌炎型犬细小，需立即急诊' },
    ],
    risk_factors: [
      {
        factor: '月龄',
        question: '犬只是否40日龄到6月龄，尤其断奶后到3月龄？',
        positive: ['幼犬', '两个月', '三个月', '四个月', '五个月', '六个月', '40日龄', '断奶'],
        weight: 'core',
      },
      {
        factor: '疫苗',
        question: '是否未打细小疫苗、只打1针、疫苗间隔超时或加强免疫过期？',
        positive: ['未打', '没打完', '还没打完', '只打一针', '疫苗超期', '未完成', '免疫空白'],
        weight: 'core',
      },
      {
        factor: '接触史',
        question: '7-14天内是否接触病犬、犬舍、宠物店、寄养、运输混养或外来犬粪便？',
        positive: ['接触病犬', '犬舍', '宠物店', '寄养', '运输', '混养', '别的动物', '粪便'],
        weight: 'core',
      },
      {
        factor: '应激/饲喂',
        question: '近期是否换环境、洗澡、运输、驱虫、喂生肉或不洁饮水？',
        positive: ['换环境', '洗澡', '运输', '驱虫', '生肉', '不洁饮水'],
        weight: 'minor',
      },
    ],
    rule_in: [
      {
        question: '是否未完成疫苗且为幼犬？',
        positive: ['幼犬', '未完成疫苗', '没打疫苗', '只打一针'],
        weight: 'core',
        evidence: '未完成免疫幼犬是细小高风险基础条件',
      },
      {
        question: '是否反复呕吐，随后出现水样腹泻或血便？',
        positive: ['反复呕吐', '一直吐', '水样腹泻', '血便', '番茄'],
        weight: 'core',
        evidence: '呕吐后腹泻/血便符合犬细小肠炎型常见进展',
      },
      {
        question: '腹泻是否番茄汁样、酱油色、带肠黏膜碎片或浓烈腥臭？',
        positive: ['番茄', '酱油色', '黑血便', '肠黏膜', '腥臭'],
        weight: 'core',
        evidence: '番茄样或黑血便伴腥臭是细小重点鉴别线索',
      },
      {
        question: '是否出现眼窝下陷、牙龈苍白冰凉、皮肤回弹慢？',
        positive: ['眼窝下陷', '牙龈苍白', '冰凉', '皮肤回弹慢', '脱水'],
        weight: 'major',
        evidence: '快速脱水提示细小病程进入危险阶段',
      },
      {
        question: '血常规是否白细胞显著下降？',
        positive: ['白细胞下降', '白细胞低', '中性粒低'],
        weight: 'core',
        evidence: '白细胞显著下降是犬细小的重要实验室支持',
      },
    ],
    rule_out: [
      {
        question: '是否成年犬、全程免疫且无接触史？',
        negative: ['成年', '已完成基础免疫', '没有接触', '没出门'],
        penalty: 'major',
        evidence: '完成免疫且无暴露史会显著降低细小概率，但不能完全排除',
      },
      {
        question: '是否明确没有血便、没有腥臭味、没有呕吐？',
        negative: ['没有血便', '无血便', '没有腥臭', '无腥臭', '没有呕吐', '不吐'],
        penalty: 'critical',
        evidence: '无血便、无腥臭、无呕吐时不应直接锁定犬细小',
      },
      {
        question: '症状是否仅为轻微软便且精神食欲正常？',
        negative: ['精神正常', '食欲正常', '只是软便', '没有发烧'],
        penalty: 'major',
        evidence: '轻微软便且全身状态正常更倾向饮食性肠胃问题或寄生虫等低危原因',
      },
    ],
    severity_stages: [
      {
        stage: '潜伏期',
        signs: ['7-14天暴露史', '暂无外在症状'],
        urgency: 'medium',
        action: '有高危接触史时隔离观察并咨询兽医是否检测',
      },
      {
        stage: '前驱期',
        signs: ['精神变差', '食欲下降', '低烧39.8-40.5℃', '偶发干呕', '软便'],
        urgency: 'high',
        action: '幼犬或未免疫犬应尽快做CPV检测，不按普通胃炎拖延',
      },
      {
        stage: '症状爆发期',
        signs: ['持续剧烈呕吐', '腥臭水样腹泻', '36小时内转血便', '快速脱水', '腹痛弓背'],
        urgency: 'critical',
        action: '立即急诊，通常需要隔离、静脉输液和实验室监测',
      },
      {
        stage: '危重衰竭期',
        signs: ['酱油色黑血便', '无意识失禁排便', '体温低于37.5℃', '牙龈冰凉苍白', '休克'],
        urgency: 'critical',
        action: '立即24小时急诊，预后风险高，不可居家观察',
      },
      {
        stage: '心肌炎型',
        signs: ['40-90日龄幼犬', '突发呼吸困难', '黏膜发紫', '倒地抽搐', '轻微腹泻后虚脱'],
        urgency: 'critical',
        action: '按心衰急症处理，立即急诊',
      },
    ],
    emergency_signs: [
      { sign: '番茄汁样或酱油色血便伴浓烈腥臭味', minTriageScore: 90, action: '立即送医，不可居家观察' },
      { sign: '12小时内呕吐5次以上或喝水即吐', minTriageScore: 85, action: '立即急诊补液和止吐评估' },
      { sign: '皮肤回弹超过5秒、眼窝下陷、牙龈冰凉苍白', minTriageScore: 90, action: '按重度脱水/休克急诊处理' },
      { sign: '体温超过40.5℃或低于37.5℃', minTriageScore: 85, action: '立即就医评估感染或休克' },
      { sign: '40-90日龄幼犬喘气、黏膜发紫、倒地无力', minTriageScore: 95, action: '怀疑心肌炎型，立即急诊' },
      { sign: '精神虚脱、无法站立、嗜睡唤不醒', minTriageScore: 90, action: '立即急诊' },
    ],
    required_tests: parvoTests,
    report_profile: {
      care_focus: [
        '立即隔离病犬并联系有传染病隔离能力的宠物医院',
        '就医途中保持保暖，避免喂食喂水造成继续呕吐',
        '环境使用含氯消毒剂规范消毒，未感染犬避免接触',
        '治疗通常依赖静脉输液、止吐、纠正电解质和继发感染控制，由兽医执行',
      ],
      forbidden: [
        '禁止自行喂止泻药、人用肠胃药或抗生素',
        '禁止强行大量饮水或喂食',
        '禁止洗澡、外出、接触其他犬',
        '禁止把血便腥臭幼犬当普通胃炎居家观察',
      ],
      owner_explanation: '犬细小病毒病是高传染性急症，问诊只能筛查风险；确诊和治疗需要CPV检测、血常规、电解质和住院支持。',
    },
    references: unique([
      ...entry.references,
      'Merck Veterinary Manual: Canine Parvovirus Infection',
      'AVMA: Canine Parvovirus',
      'Cornell Baker Institute: Canine Parvovirus',
    ]),
  }
}

function hasDigestiveSigns(entry: KnowledgeEntry): boolean {
  return buildEntrySymptoms(entry).some((symptom) => /呕吐|腹泻|血便|便|肠|胃/.test(symptom))
}

function isDiscriminativeTerm(term: string): boolean {
  return /血便|黑便|腥臭|无尿|少尿|呼吸困难|抽搐|黄疸|休克|虚脱|弓背|发绀|腹部胀大|咖啡渣|白细胞|体温|脱水|番茄/.test(term)
}

function criticalSignsForEntry(entry: KnowledgeEntry): string[] {
  const symptoms = buildEntrySymptoms(entry)
  const discriminative = symptoms.filter(isDiscriminativeTerm)
  const categoryDefaults: Record<string, string[]> = {
    消化系统: ['持续呕吐', '血便或黑便', '精神极度萎靡', '明显脱水'],
    传染病: ['高热或低体温', '精神虚脱', '脱水', '神经症状'],
    寄生虫: ['严重贫血', '血便', '幼龄动物精神差'],
    中毒: ['抽搐', '牙龈苍白', '持续呕吐', '虚脱'],
    产科: ['难产', '阴道异常出血', '精神虚脱', '发热'],
    泌尿系统: ['尿不出', '无尿', '呕吐', '精神虚脱'],
    呼吸系统: ['呼吸困难', '张口呼吸', '发绀', '虚脱'],
  }

  return unique([
    ...discriminative,
    ...(categoryDefaults[entry.category] || ['精神极度萎靡', '无法站立', '持续恶化']),
  ]).slice(0, 8)
}

function inferPositiveKeywords(question: string): string[] {
  const keywords = [
    '疫苗', '血便', '腥臭', '异物', '高脂肪', '发热', '黄疸', '抽搐',
    '无尿', '少尿', '弓背', '腹痛', '接触', '驱虫', '尿血',
  ]
  const hits = keywords.filter((keyword) => question.includes(keyword))
  return hits.length > 0 ? hits : [question.replace(/[？?]/g, '').slice(0, 12)]
}

function formatForbiddenCareRule(rule: ForbiddenCareRule): string {
  return rule.hours ? rule.rule.replace('{hours}', String(rule.hours)) : rule.rule
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function uniqueTests(tests: StructuredRequiredTest[]): StructuredRequiredTest[] {
  const byName = new Map<string, StructuredRequiredTest>()
  for (const test of tests) {
    const existing = byName.get(test.test)
    if (!existing || existing.priority === 'recommended') {
      byName.set(test.test, test)
    }
  }
  return Array.from(byName.values())
}

function ensureCategoryPathDepth(path: string[], category: string): string[] {
  if (path.length >= 2) return path
  return unique([...path, category, '专科'])
}
