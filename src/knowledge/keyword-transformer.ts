// ============================================
// Keyword Transformer — RAG 优化：LLM 关键词转换
// 将用户口语转化为标准化兽医关键词，输出结构化结果
// 对比旧的 extractKeywordsWithLLM（仅返回 string[]），
// 本模块返回 TransformedKeywords 含 coreSymptoms +
// expandedSynonyms + diseaseDirections + confidence
// ============================================

import type { TransformedKeywords } from './types'
import { callLLM } from '@/models/client'
import { loadSynonyms } from './loader'

/**
 * KB 感知的关键词转换 Prompt
 * 包含当前物种的可用症状类别提示，让 LLM 输出更精准
 */
function buildTransformerPrompt(
  userText: string,
  species: string,
  kbContext?: string
): string {
  const prompt = `你是宠物医学症状关键词提取专家。将用户口语转化为标准化兽医关键词。

规则：
1. 必须使用标准兽医学名称（如"排尿困难"而非"尿不出来"，"食欲下降"而非"不吃东西"）
2. 同时输出同义表述用于扩展检索（如"呕吐"的同义表述包括"吐了、反胃、干呕"）
3. 推断可能的疾病方向（用于辅助 RAG 检索的类别过滤）
4. 评估你对这次提取的置信度（0-1）

${kbContext || ''}

请输出严格 JSON（不要 markdown 代码块）:
{
  "coreSymptoms": ["标准化核心症状1", "标准化核心症状2"],
  "expandedSynonyms": ["同义表述1", "同义表述2"],
  "diseaseDirections": ["可能的疾病方向1"],
  "confidence": 0.85
}

当前物种：${species}
用户输入：${userText}
输出：`

  return prompt
}

/**
 * 构建 KB 上下文提示（包含可用症状类别）
 */
function buildKBContext(species: string): string {
  try {
    const synonymTable = loadSynonyms(species as '犬' | '猫' | '兔' | '仓鼠')
    const standardTerms = Object.keys(synonymTable.mappings)

    if (standardTerms.length === 0) return ''

    // 取部分代表性术语作为提示（避免 prompt 过长）
    const sampleTerms = standardTerms.slice(0, 30)
    return `可用标准兽医术语（参考，不限于此）：${sampleTerms.join('、')}`
  } catch {
    return ''
  }
}

/**
 * LLM 关键词转换（增强版）
 *
 * 与 pipeline.ts 中旧 extractKeywordsWithLLM 的区别：
 *   1. Prompt 包含 KB 词汇提示，输出更贴近知识库
 *   2. 结构化输出（TransformedKeywords），含同义词扩展 + 疾病方向
 *   3. 自带置信度评估
 *   4. 解析失败时回退到规则提取
 *
 * @param text - 用户原始输入
 * @param species - 物种
 * @returns TransformedKeywords
 */
export async function transformKeywords(
  text: string,
  species: string
): Promise<TransformedKeywords> {
  const kbContext = buildKBContext(species)
  const prompt = buildTransformerPrompt(text, species, kbContext)

  try {
    const result = await callLLM(
      '你是兽医症状关键词提取专家。只输出JSON，不要markdown。',
      prompt,
      { temperature: 0, maxTokens: 300 }
    )

    if (result.success && result.content) {
      const cleaned = result.content
        .replace(/```json|```/g, '')
        .trim()
      const parsed = JSON.parse(cleaned)

      return {
        coreSymptoms: filterValidStrings(parsed.coreSymptoms),
        expandedSynonyms: filterValidStrings(parsed.expandedSynonyms),
        diseaseDirections: filterValidStrings(parsed.diseaseDirections),
        confidence:
          typeof parsed.confidence === 'number'
            ? Math.max(0, Math.min(1, parsed.confidence))
            : 0.7,
      }
    }
  } catch {
    // LLM 转换失败，回退到简单规则提取
  }

  // 回退：返回空结构，由上游规则引擎补充
  return {
    coreSymptoms: [],
    expandedSynonyms: [],
    diseaseDirections: [],
    confidence: 0,
  }
}

/**
 * 旧版兼容接口 — 返回简单 string[]（与 extractKeywordsWithLLM 行为一致）
 * 内部调用 transformKeywords 并展平
 */
export async function extractKeywordsCompat(
  text: string,
  species: string
): Promise<string[]> {
  const result = await transformKeywords(text, species)
  return [
    ...result.coreSymptoms,
    ...result.expandedSynonyms,
    ...result.diseaseDirections,
  ].filter((k, i, arr) => arr.indexOf(k) === i) // 去重
}

/**
 * 合并多个来源的关键词（去重 + LLM 结果优先）
 *
 * @param llmKeywords - LLM 提取的关键词
 * @param ruleKeywords - 规则引擎提取的关键词
 * @returns 合并后的关键词列表
 */
export function mergeKeywords(
  llmKeywords: TransformedKeywords,
  ruleKeywords: string[]
): string[] {
  const merged = new Set<string>()

  // LLM 结果优先（更精准）
  for (const kw of llmKeywords.coreSymptoms) merged.add(kw)
  for (const kw of llmKeywords.expandedSynonyms) merged.add(kw)

  // 规则引擎补充
  for (const kw of ruleKeywords) merged.add(kw)

  return Array.from(merged)
}

// ---- 辅助 ----

function filterValidStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  return arr.filter(
    (k): k is string => typeof k === 'string' && k.trim().length > 1
  )
}
