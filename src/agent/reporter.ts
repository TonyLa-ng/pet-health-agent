// ============================================
// M7: Report Generator (报告生成器)
// 模板选择的唯一决策点 + 内容填充 + 合规校验
// ============================================

import type { ClinicalReport, ReportTemplate, ScoredDiagnosis, UnableToDiagnoseReason, DiagnosisSource, ExternalSource } from './types'
import type { TriageResult, AssessmentResult, NormalizedInput } from './types'
import type { PetProfile } from '@/store/types'
import type { KnowledgeEntry } from '@/knowledge/types'
import type { VetMapSearchResult } from '@/tools/vet-map'
import { DISCLAIMER_TEXT, guardOutput } from '@/compliance/output-guard'
import { getAppendItems } from '@/rules'
import { getConsultationConfig } from './consultation-config'

export interface ReportGenerationOptions {
  knowledgeEntries?: KnowledgeEntry[]
  vetMap?: VetMapSearchResult
}

const MIN_REPORTABLE_CONFIDENCE = getConsultationConfig().convergence.minimumReportConfidence

/**
 * 生成临床报告
 *
 * @param triage - M2 急症检测结果
 * @param diagnoses - M6 置信度计算后的诊断列表
 * @param assessment - M4 追问评估结果
 * @param normalized - M3 归一化结果
 * @param pet - M0 宠物档案
 */
export function generateReport(
  triage: TriageResult,
  diagnoses: ScoredDiagnosis[] | null,
  assessment: AssessmentResult | null,
  normalized: NormalizedInput,
  pet: PetProfile,
  source: DiagnosisSource = 'knowledge_base',
  webSources: ExternalSource[] = [],
  options: ReportGenerationOptions = {}
): ClinicalReport {
  // 1. 模板选择（唯一决策点）
  const template = selectTemplate(triage, diagnoses, assessment)

  // 2. 填充各区块
  const sections = buildSections(template, triage, diagnoses, assessment, normalized, pet, source, webSources, options)

  // 3. 拼接免责声明
  const reportText = sections.map((s) => `【${s.title}】\n${s.content}`).join('\n\n')
  const fullText = reportText + '\n\n' + DISCLAIMER_TEXT

  // 4. 输出合规校验
  const complianceResult = guardOutput(fullText)

  const report: ClinicalReport = {
    template: `template_${template}` as ReportTemplate,
    unableToDiagnoseReason: template === 4 ? determineUnableReason(diagnoses, assessment) : undefined,
    source,
    webSources,
    sections: complianceResult.passed
      ? sections
      : sections.map((s) => ({
          ...s,
          content: stripViolations(s.content),
        })),
    disclaimerText: DISCLAIMER_TEXT,
    disclaimerHash: '',
    generatedAt: Date.now(),
  }

  return report
}

/** 模板选择 */
function selectTemplate(
  triage: TriageResult,
  diagnoses: ScoredDiagnosis[] | null,
  assessment: AssessmentResult | null
): 1 | 2 | 3 | 4 {
  // 急症：仍走模板1（含疾病分析），预警由 pipeline 在报告顶部注入
  if (triage.level === 'critical') return 1
  if (triage.level === 'urgent') return 1

  // 信息不足 → 模板 2（追问）
  if (assessment && !assessment.isComplete && assessment.roundsUsed < 3) return 2

  // 低置信度或无诊断 → 模板 4
  if (!diagnoses || diagnoses.length === 0) return 4
  if (diagnoses[0].confidence < MIN_REPORTABLE_CONFIDENCE) return 4

  // 正常 → 模板 1
  return 1
}

/** 构建报告区块 */
function buildSections(
  template: 1 | 2 | 3 | 4,
  triage: TriageResult,
  diagnoses: ScoredDiagnosis[] | null,
  assessment: AssessmentResult | null,
  normalized: NormalizedInput,
  pet: PetProfile,
  source: DiagnosisSource = 'knowledge_base',
  webSources: ExternalSource[] = [],
  options: ReportGenerationOptions = {}
): ClinicalReport['sections'] {
  const sections: ClinicalReport['sections'] = []
  const matchedEntries = matchKnowledgeEntries(diagnoses || [], options.knowledgeEntries || [])

  if (triage.level === 'critical') {
    sections.push({
      type: 'emergency_signs',
      title: '紧急就医预警',
      content: buildEmergencyContent(triage, options.vetMap),
    })
  }

  // 宠物基础信息（模板 1/3/4）
  if (template !== 2) {
    sections.push({
      type: 'pet_info',
      title: '宠物基础信息',
      content: `品种：${pet.breed}  年龄：${pet.age}岁  体重：${pet.weight}kg  免疫情况：${pet.vaccination}  既往病史：${pet.medicalHistory || '无'}`,
    })
  }

  // 症状梳理（模板 1/4）
  if (template === 1 || template === 4) {
    const chiefNames = normalized.chiefComplaint.map((s) => s.original || s.name).join('、')
    const accompanyingNames = normalized.accompanyingSymptoms.map((s) => s.original || s.name).join('、')
    const duration = normalized.timeline.duration !== 'unknown' ? `持续${normalized.timeline.duration}` : '时长未知'

    sections.push({
      type: 'symptom_summary',
      title: '本次症状梳理',
      content: `主要症状：${chiefNames || '待补充'}\n伴随症状：${accompanyingNames || '无'}\n持续时间：${duration}\n发作模式：${normalized.timeline.pattern}`,
    })
  }

  // 模板 1：正式诊断
  if (template === 1 && diagnoses) {
    // LLM 兜底来源警告
    const sourceWarning =
      source === 'llm_fallback'
        ? '⚠️ 以下分析来自联网大模型通用知识，非专项兽医知识库匹配，准确性请自行判断，建议尽快前往宠物医院进行专业检查。\n\n'
        : source === 'web_search'
          ? '🌐 以下分析结合了联网搜索摘要，但仍不是执业兽医诊断；请以线下体检、影像学和实验室检查为准。\n\n'
        : ''

    const diagText = sourceWarning + diagnoses
      .map(
        (d, i) =>
          `${i + 1}. ${d.disease}  置信度：${d.confidence}%  ${badgeEmoji(d.confidence)}\n` +
          `   支持依据：${d.supportingEvidence}\n` +
          `   不支持依据：${d.opposingEvidence}`
      )
      .join('\n')

    sections.push({
      type: 'diagnosis',
      title: '初步判断（按可能性排序）',
      content: diagText,
      metadata: { topConfidence: diagnoses[0]?.confidence },
    })

    if (source === 'web_search' && webSources.length > 0) {
      sections.push({
        type: 'sources',
        title: '联网搜索来源',
        content: webSources
          .map((sourceItem, index) => `${index + 1}. ${sourceItem.title}\n${sourceItem.url}`)
          .join('\n'),
      })
    }

    // 鉴别诊断 + 疾病特异建议检查
    const diffText = buildDifferentialAndTestText(diagnoses, matchedEntries)

    if (diffText) {
      sections.push({
        type: 'differential',
        title: '鉴别诊断与建议检查',
        content: diffText,
      })
    }

    // 居家护理
    const careContent = buildCareContent(matchedEntries)

    sections.push({
      type: 'home_care',
      title: '居家护理建议',
      content: careContent,
    })
  }

  // 模板 2：追问
  if (template === 2 && assessment) {
    const questionText = assessment.questions
      .map((q) => `${q.question}（${q.guidance}）`)
      .join('\n')

    sections.push({
      type: 'symptom_summary',
      title: '信息补充提示',
      content: `为了更准确地判断宠物情况，请补充以下关键信息：\n${questionText}\n\n补充后我会为你做进一步的分析。`,
    })
  }

  // 模板 3：急症预警
  if (template === 3) {
    const alertText =
      `⚠️ 根据你描述的症状，属于宠物急症范畴，存在较高健康风险，\n` +
      `请**立即携带宠物前往正规24小时宠物医院急诊**，不要自行处理或等待观察。\n\n` +
      `${triage.alerts.join('\n')}\n\n` +
      `常见急症处理注意事项：\n` +
      `1. 保持宠物呼吸通畅\n` +
      `2. 避免按压宠物腹部\n` +
      `3. 尽快送往最近的正规宠物医院`

    sections.push({
      type: 'emergency_signs',
      title: '⚠️ 紧急就医预警',
      content: alertText,
    })
  }

  // 模板 4：无法判断
  if (template === 4) {
    const reason = determineUnableReason(diagnoses, assessment)
    const reasonText =
      reason === 'insufficient_info'
        ? '当前提供的关键症状信息不足，缺少必要的诊断依据，无法给出可靠的初步判断。\n建议：补充症状持续时间、频率、饮食变化等信息后再次咨询，或直接前往宠物医院进行基础检查。'
        : reason === 'atypical_symptoms'
          ? '基于目前描述的症状组合不具备典型疾病特征，难以归纳为明确的初步判断方向。\n建议：直接前往宠物医院由执业兽医面诊，进行系统检查。'
          : '当前描述的症状在现有知识库中暂无明确匹配的疾病记录。\n建议：前往宠物医院进行专业检查，您的描述将帮助我们进一步完善知识库。'

    sections.push({
      type: 'symptom_summary',
      title: '无法准确判断说明',
      content: reasonText,
    })

    const uncertainRangeText = buildUncertainRangeText(assessment, options.knowledgeEntries || [])
    if (uncertainRangeText) {
      sections.push({
        type: 'differential',
        title: '待排查范围与建议检查',
        content: uncertainRangeText,
      })
    }
  }

  return sections
}

function matchKnowledgeEntries(
  diagnoses: ScoredDiagnosis[],
  entries: KnowledgeEntry[]
): KnowledgeEntry[] {
  const matched: KnowledgeEntry[] = []
  for (const diagnosis of diagnoses) {
    const entry = entries.find((candidate) =>
      diagnosis.disease.includes(candidate.disease) ||
      candidate.disease.includes(diagnosis.disease)
    )
    if (entry && !matched.some((item) => item.id === entry.id)) {
      matched.push(entry)
    }
  }
  return matched
}

function buildDifferentialAndTestText(
  diagnoses: ScoredDiagnosis[],
  entries: KnowledgeEntry[]
): string {
  const blocks: string[] = []
  const differentials = diagnoses
    .flatMap((d) => d.differentialDiagnosis)
    .filter((v, i, a) => v && a.indexOf(v) === i)

  if (differentials.length > 0) {
    blocks.push('需鉴别：\n' + differentials.map((d) => `- ${d}`).join('\n'))
  }

  const testLines = entries
    .flatMap((entry) => entry.required_tests || [])
    .filter((item, index, array) => array.findIndex((other) => other.test === item.test) === index)
    .map((item) => `- ${item.test}：${item.reason}`)

  if (testLines.length > 0) {
    blocks.push('建议检查：\n' + testLines.join('\n'))
  }

  return blocks.join('\n\n')
}

function buildUncertainRangeText(
  assessment: AssessmentResult | null,
  entries: KnowledgeEntry[]
): string {
  const candidates = assessment?.convergentCandidates?.slice(0, 3) || []
  if (candidates.length === 0) return ''

  const candidateLines = candidates.map((candidate) =>
    `- ${candidate.disease}：匹配度约${Math.round(candidate.score)}%，${candidate.reason}`
  )

  const candidateEntries = candidates
    .map((candidate) => entries.find((entry) =>
      candidate.disease.includes(entry.disease) ||
      entry.disease.includes(candidate.disease)
    ))
    .filter((entry): entry is KnowledgeEntry => Boolean(entry))

  const testLines = candidateEntries
    .flatMap((entry) => entry.required_tests || [])
    .filter((item, index, array) => array.findIndex((other) => other.test === item.test) === index)
    .map((item) => `- ${item.test}：${item.reason}`)

  const blocks = [
    '目前不直接输出单一诊断，但以下方向需要优先排查：\n' + candidateLines.join('\n'),
  ]

  if (testLines.length > 0) {
    blocks.push('建议到院检查：\n' + testLines.join('\n'))
  }

  return blocks.join('\n\n')
}

function buildCareContent(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) {
    const forbiddenItems = getAppendItems()
    return (
      '可做：\n- 确保充足饮水，观察精神状态变化\n- 恢复进食时从少量易消化食物开始\n\n' +
      '禁止：\n' +
      forbiddenItems.map((item) => `- ${item}`).join('\n')
    )
  }

  const careFocus = entries
    .flatMap((entry) => entry.report_profile?.care_focus || [])
    .filter((v, i, a) => v && a.indexOf(v) === i)
  const forbidden = entries
    .flatMap((entry) => entry.report_profile?.forbidden || [])
    .filter((v, i, a) => v && a.indexOf(v) === i)

  return (
    '可做：\n' +
    careFocus.slice(0, 6).map((item) => `- ${item}`).join('\n') +
    '\n\n禁止：\n' +
    forbidden.slice(0, 8).map((item) => `- ${item}`).join('\n')
  )
}

function buildEmergencyContent(
  triage: TriageResult,
  vetMap?: VetMapSearchResult
): string {
  const lines = [
    `急症评分：${triage.score}/100`,
    `匹配急症信号：${triage.matchedSignals.join('、') || '危重风险'}`,
    '',
    '请立即携带宠物前往正规24小时宠物医院急诊，不要自行用药或等待观察。',
  ]

  if (vetMap?.status === 'ok') {
    lines.push('', '附近可尝试联系的动物医院：')
    for (const hospital of vetMap.hospitals.slice(0, 3)) {
      lines.push(`- ${hospital.name}：${hospital.address}`)
    }
  } else if (vetMap?.status === 'needs_location') {
    lines.push('', `地图提示：${vetMap.message}`)
  } else if (vetMap?.status === 'error') {
    lines.push('', `地图提示：${vetMap.message}`)
  }

  return lines.join('\n')
}

/** 确定无法判断的原因 */
function determineUnableReason(
  diagnoses: ScoredDiagnosis[] | null,
  assessment: AssessmentResult | null
): UnableToDiagnoseReason {
  if (assessment && !assessment.isComplete) return 'insufficient_info'
  if (diagnoses && diagnoses.length > 0 && diagnoses[0].confidence < MIN_REPORTABLE_CONFIDENCE) return 'atypical_symptoms'
  return 'no_knowledge_match'
}

/** 置信度 → emoji */
function badgeEmoji(confidence: number): string {
  if (confidence >= 80) return '🟢'
  if (confidence >= 65) return '🟡'
  if (confidence >= 50) return '🟠'
  return '🔴'
}

/** 剥离违规内容 */
function stripViolations(content: string): string {
  return content
    .replace(/肯定是|百分百是|绝对是/g, '可能是')
    .replace(/确诊为/g, '初步判断为')
    .replace(/\d+mg\/kg/g, '[剂量已移除]')
}
