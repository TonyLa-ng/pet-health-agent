// ============================================
// Monitoring: Metrics (技术指标打点)
// ============================================

import { logger } from './logger'

interface MetricRecord {
  name: string
  value: number
  tags: Record<string, string>
  timestamp: number
}

const metrics: MetricRecord[] = []

/**
 * 记录指标
 */
export function recordMetric(
  name: string,
  value: number,
  tags: Record<string, string> = {}
): void {
  const record: MetricRecord = {
    name,
    value,
    tags,
    timestamp: Date.now(),
  }
  metrics.push(record)
  logger.debug(`metric: ${name}=${value}`, tags)
}

/**
 * 记录 LLM 调用指标
 */
export function recordLLMCall(success: boolean, latencyMs: number): void {
  recordMetric('llm_call_total', 1, { success: String(success) })
  recordMetric('llm_latency_ms', latencyMs, { success: String(success) })
}

/**
 * 记录急症触发
 */
export function recordTriage(level: string, score: number): void {
  recordMetric('triage_trigger', 1, { level })
  recordMetric('triage_score', score, { level })
}

/**
 * 记录模板使用
 */
export function recordTemplate(template: string): void {
  recordMetric('template_used', 1, { template })
}

/**
 * 获取指标摘要（MVP 监控面板用）
 */
export function getMetricsSummary(): {
  llmCalls: number
  llmSuccessRate: number
  triageDistribution: Record<string, number>
  templateDistribution: Record<string, number>
} {
  const llmCalls = metrics.filter((m) => m.name === 'llm_call_total')
  const llmSuccess = llmCalls.filter((m) => m.tags.success === 'true')
  const triages = metrics.filter((m) => m.name === 'triage_trigger')
  const templates = metrics.filter((m) => m.name === 'template_used')

  const triageDist: Record<string, number> = {}
  for (const t of triages) {
    triageDist[t.tags.level] = (triageDist[t.tags.level] || 0) + 1
  }

  const templateDist: Record<string, number> = {}
  for (const t of templates) {
    templateDist[t.tags.template] = (templateDist[t.tags.template] || 0) + 1
  }

  return {
    llmCalls: llmCalls.length,
    llmSuccessRate: llmCalls.length > 0 ? llmSuccess.length / llmCalls.length : 0,
    triageDistribution: triageDist,
    templateDistribution: templateDist,
  }
}
