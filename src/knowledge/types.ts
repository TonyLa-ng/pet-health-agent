// ============================================
// Knowledge Base Types — M1 知识库 + 急症规则 + 时长词典
// ============================================

// ---- 知识条目 ----

/** 知识条目状态 */
export type KnowledgeStatus = 'active' | 'deprecated' | 'archived'

/** 知识库置信度 */
export type KnowledgeConfidence = 'high' | 'medium' | 'low'

/** 症状详情 */
export interface SymptomDetail {
  frequency?: string // 高频/间歇/持续
  content?: string // 呕吐物内容/排泄物性状等
  trigger?: string // 触发条件
}

/** 疾病症状定义 */
export interface DiseaseSymptoms {
  primary: string[] // 主要症状
  secondary: string[] // 次要症状
  detail: Record<string, SymptomDetail> // 症状详情
}

/** 鉴别诊断 */
export interface DifferentialDiagnosis {
  disease: string // 鉴别疾病名
  differentiator: string // 区分要点
  key_questions: string[] // 鉴别关键问题
}

/** 结构化问诊权重 */
export type StructuredSignalWeight = 'core' | 'major' | 'minor'

/** 结构化关键症状 */
export interface StructuredKeySymptom {
  term: string
  weight: StructuredSignalWeight
  ask: string
  supports: string
}

/** 流行病学/环境风险因素 */
export interface StructuredRiskFactor {
  factor: string
  question: string
  positive: string[]
  weight: StructuredSignalWeight
}

/** rule-in 诊断线索 */
export interface StructuredRuleIn {
  question: string
  positive: string[]
  weight: StructuredSignalWeight
  evidence: string
}

/** rule-out / 反证线索 */
export interface StructuredRuleOut {
  question: string
  negative: string[]
  penalty: 'critical' | 'major' | 'minor'
  evidence: string
}

/** 病程或危重阶段 */
export interface StructuredSeverityStage {
  stage: string
  signs: string[]
  urgency: 'low' | 'medium' | 'high' | 'critical'
  action: string
}

/** 疾病特异急症信号 */
export interface StructuredEmergencySign {
  sign: string
  minTriageScore: number
  action: string
}

/** 建议检查项目 */
export interface StructuredRequiredTest {
  test: string
  reason: string
  priority: 'required' | 'recommended'
}

/** 疾病特异报告素材 */
export interface StructuredReportProfile {
  care_focus: string[]
  forbidden: string[]
  owner_explanation?: string
}

/** 条件化护理禁止规则 */
export interface ForbiddenCareRule {
  rule: string // 规则模板，支持 {hours} 等变量
  hours?: number // 时长参数
  condition: string // 适用条件，"default" 为默认
}

/** 知识条目 — 完整结构 */
export interface KnowledgeEntry {
  id: string
  disease: string
  species: string[]
  category: string // 疾病分类（消化系统/泌尿系统 等）
  symptoms: DiseaseSymptoms
  urgency: 'low' | 'medium' | 'high' | 'critical'
  diagnosis_basis: string
  home_care: string
  forbidden_care: ForbiddenCareRule[]
  medication: string[]
  vet_threshold: string
  confidence: KnowledgeConfidence
  differential_diagnosis: DifferentialDiagnosis[]
  references: string[]
  version: number
  status: KnowledgeStatus
  created_at: string
  updated_at: string
  reviewed_by: string | null
  category_path?: string[]
  entry_symptoms?: string[]
  key_symptoms?: StructuredKeySymptom[]
  risk_factors?: StructuredRiskFactor[]
  rule_in?: StructuredRuleIn[]
  rule_out?: StructuredRuleOut[]
  severity_stages?: StructuredSeverityStage[]
  emergency_signs?: StructuredEmergencySign[]
  required_tests?: StructuredRequiredTest[]
  report_profile?: StructuredReportProfile
}

// ---- 急症规则 ----

/** 急症关键词规则 */
export interface EmergencySignal {
  keyword: string
  base_score: number
  boost_keywords: string[] // 强化词（"持续""大量"等）
  boost_score: number
  combination_boost: string[] // 组合症状
  combination_score: number
  duration_effect: 'negative' | 'positive' | 'neutral'
  species_override: Record<string, Partial<EmergencySignal>>
}

/** 严重度指标 */
export interface SeverityIndicator {
  signal: string
  score: number
}

/** 急症规则文件结构 */
export interface EmergencyRules {
  version: number
  global_signals: EmergencySignal[]
  duration_scoring: Record<string, Record<string, number>>
  severity_indicators: SeverityIndicator[]
  risk_levels: {
    critical: { min_score: number; action: 'immediate_block' }
    urgent: {
      min_score: number
      action: 'allow_one_followup'
      followup_timeout_minutes: number
      auto_escalate_on_timeout: boolean
    }
    watch: { min_score: number; action: 'continue_with_warning' }
    normal: { min_score: number; action: 'continue' }
  }
  low_risk_reminder: {
    enabled: boolean
    condition: string
    message: string
  }
}

// ---- 时长提取词典 ----

/** 时长映射关键词 */
export interface DurationMapping {
  keywords: string[]
  pattern: string
}

/** 时长提取词典 */
export interface DurationDict {
  mappings: Record<string, DurationMapping>
  fuzzy_markers: string[]
  conflict_detection: {
    description: string
    example: string
  }
}

// ---- 物种配置 ----

/** 物种体征正常范围 */
export interface VitalRange {
  min: number
  max: number
  unit: string
}

/** 物种配置文件 */
export interface SpeciesConfig {
  species: string
  normal_vitals: {
    temperature: VitalRange
    heart_rate: VitalRange
    respiratory_rate: VitalRange
  }
  emergency_override: Array<{
    signal: string
    base_score: number
    reason: string
  }>
  extra_mandatory_fields: string[]
  allow_cross_species_search: boolean
  allow_disease_diagnosis: boolean
  enabled_features: string[]
  disabled_features: string[]
  excluded_diseases: string[]
  care_restrictions?: string[]
}

// ---- 检索 ----

/** 检索结果 */
export interface SearchResult {
  entry: KnowledgeEntry
  score: number // 余弦相似度 0-1
  matchDetails: {
    symptomOverlap: number // 症状重叠数
    primaryHitRate: number // 主要症状命中率
    isCrossSpecies: boolean // 是否跨物种结果
  }
}

// ---- 归一化验证（RAG 优化新增） ----

/** 验证术语来源 */
export type VerificationSource = 'exact' | 'synonym' | 'fuzzy'

/** 经验证的关键词 */
export interface VerifiedTerm {
  term: string // 原始词汇
  canonicalForm: string // 标准化形式（KB 中的术语）
  confidence: number // 验证置信度 0-1
  source: VerificationSource // 匹配来源
}

/** 归一化验证结果 */
export interface VerificationResult {
  verifiedTerms: VerifiedTerm[] // 通过验证的关键词
  unmappedTerms: string[] // 无法映射到 KB 词汇的关键词
  coverage: number // 覆盖率 = verified / total
  suggestionForRetry?: string // 覆盖率过低时的重试提示
}

/** LLM 关键词转换输出 */
export interface TransformedKeywords {
  coreSymptoms: string[] // 标准化核心症状
  expandedSynonyms: string[] // 扩展同义词
  diseaseDirections: string[] // 可能的疾病方向
  confidence: number // 提取置信度 0-1
}
