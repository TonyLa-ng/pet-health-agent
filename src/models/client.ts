// ============================================
// LLM Client — 模型调用 + 超时/重试 + Token 预算
// ============================================

import type { LLMConfig, LLMCallResult, TokenBudget, ModelSwitchEvent } from './types'

/** 默认 LLM 配置 */
export function getDefaultConfig(): LLMConfig {
  return {
    provider: process.env.MODEL_PROVIDER || 'openai_compat',
    apiKey: process.env.MODEL_API_KEY || '',
    baseUrl: process.env.MODEL_BASE_URL || 'https://api.deepseek.com/v1',
    modelName: process.env.MODEL_NAME || 'deepseek-chat',
    backupModelName: process.env.MODEL_BACKUP_NAME || 'deepseek-chat',
    fallbackEnabled: process.env.MODEL_FALLBACK_ENABLED !== 'false',
    timeout: parseInt(process.env.AGENT_TIMEOUT_MS || '15000', 10),
    maxRetries: parseInt(process.env.AGENT_MAX_RETRIES || '2', 10),
    temperature: parseFloat(process.env.AGENT_TEMPERATURE || '0.3'),
    maxTokens: 4096,
  }
}

/**
 * 粗略估算文本的 Token 数量
 * 中文 ≈ 1.5 字符/token，英文 ≈ 4 字符/token
 */
export function estimateTokens(text: string): number {
  let chineseChars = 0
  let otherChars = 0
  for (const char of text) {
    if (/[一-鿿]/.test(char)) {
      chineseChars++
    } else {
      otherChars++
    }
  }
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

/**
 * Token 预算检查
 */
export function checkTokenBudget(
  systemPrompt: string,
  knowledgeContext: string,
  conversationHistory: string,
  maxBudget: number = 8000
): TokenBudget {
  const systemTokens = estimateTokens(systemPrompt)
  const knowledgeTokens = estimateTokens(knowledgeContext)
  const historyTokens = estimateTokens(conversationHistory)
  const outputReserve = 2000

  const used = systemTokens + knowledgeTokens + historyTokens + outputReserve

  let strategy: TokenBudget['strategy'] = 'full'
  if (used > maxBudget * 1.2) {
    strategy = 'degraded'
  } else if (used > maxBudget) {
    strategy = 'trimmed'
  } else if (used > maxBudget * 0.7) {
    strategy = 'summary_only'
  }

  return {
    total: maxBudget,
    used,
    remaining: Math.max(0, maxBudget - used),
    isExceeded: used > maxBudget * 1.2,
    strategy,
  }
}

/**
 * 调用 LLM（简化的 fetch 封装）
 *
 * MVP 阶段：返回 mock 响应（通过环境变量 LLM_MOCK 控制）
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  config?: Partial<LLMConfig>
): Promise<LLMCallResult> {
  const cfg = { ...getDefaultConfig(), ...config }

  // MVP Mock 模式
  if (process.env.LLM_MOCK === 'true' || !cfg.apiKey || cfg.apiKey === 'your-api-key-here') {
    console.warn(
      `[LLM] ⚠️ MOCK MODE active (LLM_MOCK=${process.env.LLM_MOCK}, hasKey=${!!cfg.apiKey}, key=${cfg.apiKey?.slice(0, 8)}...)`
    )
    return mockLLMResponse(userMessage, systemPrompt)
  }
  console.log(
    `[LLM] 🔗 Real API call to ${cfg.modelName} @ ${cfg.baseUrl} (key=${cfg.apiKey?.slice(0, 8)}...)`
  )

  // 真实调用
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), cfg.timeout)

    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.error(`[LLM] ❌ API error ${response.status}: ${errorBody.slice(0, 200)}`)
      return handleLLMError(response.status, cfg)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    return {
      success: true,
      content,
      error: null,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      switchedModel: false,
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    if (error.name === 'AbortError') {
      console.error(`[LLM] ⏱️ Timeout after ${cfg.timeout}ms`)
      return tryFallback(cfg, { type: 'timeout', message: 'Request timeout', retryable: true })
    }
    console.error(`[LLM] 🌐 Network error: ${error.message}`)
    return tryFallback(cfg, { type: 'network_error', message: error.message, retryable: true })
  }
}

/** 错误处理 + 降级切换 */
async function handleLLMError(status: number, cfg: LLMConfig): Promise<LLMCallResult> {
  if (status === 401 || status === 403) {
    return {
      success: false,
      content: null,
      error: { type: 'auth_error', message: `LLM auth error (${status})`, statusCode: status, retryable: false },
      usage: null,
      switchedModel: false,
    }
  }
  if (status === 429) {
    return {
      success: false,
      content: null,
      error: { type: 'rate_limit', message: 'Rate limited', statusCode: status, retryable: true },
      usage: null,
      switchedModel: false,
    }
  }
  return tryFallback(cfg, { type: 'server_error', message: `Server error (${status})`, statusCode: status, retryable: true })
}

/** 尝试备用模型 */
async function tryFallback(cfg: LLMConfig, error: LLMCallResult['error']): Promise<LLMCallResult> {
  if (!cfg.fallbackEnabled || cfg.backupModelName === cfg.modelName) {
    return { success: false, content: null, error, usage: null, switchedModel: false }
  }

  // 简化：同会话最多切换 1 次
  try {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.backupModelName,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 100,
      }),
    })
    // 备用模型可用
    void response
  } catch {
    return { success: false, content: null, error, usage: null, switchedModel: false }
  }

  return { success: false, content: null, error, usage: null, switchedModel: true }
}

/**
 * Mock LLM 响应（MVP 阶段，无 API Key 时使用）
 */
function mockLLMResponse(userMessage: string, systemPrompt?: string): Promise<LLMCallResult> {
  // 检测是否为兜底 prompt — 返回联网分析风格回复
  const isFallback = systemPrompt?.includes('知识库未匹配到相关疾病记录')

  const hasVomit = /吐|呕/.test(userMessage)
  const hasDiarrhea = /拉|窜|腹泻|稀/.test(userMessage)
  const hasUrinary = /尿|排尿|猫砂盆/.test(userMessage)
  const hasAppetite = /不吃|食欲|绝食/.test(userMessage)
  const hasLethargy = /精神|蔫|不爱动|躲/.test(userMessage)
  const hasSkin = /皮肤|痒|掉毛|秃|脱毛|红疹|疙瘩|肿块/.test(userMessage)
  const hasEye = /眼睛|流泪|眼屎|红肿|眯眼/.test(userMessage)
  const hasEar = /耳朵|挠耳|甩头|耳臭/.test(userMessage)
  const hasLimp = /瘸|跛|腿疼|不敢着地|关节/.test(userMessage)
  const hasMouth = /口臭|牙|牙龈|流口水|口腔/.test(userMessage)

  let content = ''

  // 兜底路径 — 知识库无匹配，联网大模型分析
  if (isFallback) {
    const directions: string[] = []
    if (hasSkin) directions.push('皮肤疾病（过敏性皮炎/真菌感染/寄生虫）')
    if (hasEye) directions.push('眼部疾病（结膜炎/角膜炎/泪道阻塞）')
    if (hasEar) directions.push('耳部疾病（耳螨/外耳炎/中耳炎）')
    if (hasLimp) directions.push('骨骼关节问题（关节炎/韧带损伤/骨折）')
    if (hasMouth) directions.push('口腔疾病（牙周病/口炎/异物）')

    if (directions.length > 0) {
      content =
        '【初步判断】\n' +
        '根据通用兽医学训练数据，以下为可能的参考方向（⚠️ 未经专项知识库验证）：\n' +
        directions.map((d, i) => `${i + 1}. ${d} — 可能性参考，需兽医面诊确诊`).join('\n') +
        '\n\n【建议】\n- 建议前往宠物医院进行相关检查\n- 本分析来自通用大模型，非权威兽医诊断'
    } else {
      content =
        '【初步判断】\n基于当前信息，联网大模型也无法给出有针对性的参考分析。\n症状描述可能不够具体，或属于需要专业检查才能确定的罕见情况。\n\n【建议】\n- 补充更详细的症状描述（持续时间、频率、具体表现）\n- 直接前往宠物医院进行专业检查'
    }
  } else if (hasUrinary) {
    content = `【初步判断】
1. 下泌尿道疾病/尿闭  置信度：待计算
   支持依据：排尿困难、频繁排尿姿势
   不支持依据：无明显血尿描述

【鉴别诊断】
- 与膀胱炎的区别：膀胱炎通常仍有尿液排出

【居家护理建议】
可做：确保充足饮水
禁止：禁止自行导尿，禁止使用利尿剂`
  } else if (hasVomit && (hasAppetite || hasLethargy)) {
    content = `【初步判断】
1. 急性胃炎  置信度：待计算
   支持依据：呕吐、食欲下降、精神萎靡与急性胃炎高度吻合
   不支持依据：无血便、无高烧，暂不支持细小病毒感染

【鉴别诊断】
- 与肠道异物的区别：需确认是否有吞食异物史
- 与胰腺炎的区别：需确认是否进食高脂肪食物

【居家护理建议】
可做：短期禁食12-24小时，少量多餐恢复进食
禁止：禁止使用人用止吐药，禁止强行灌食`
  } else if (hasDiarrhea) {
    content = `【初步判断】
1. 急性胃肠炎  置信度：待计算
   支持依据：腹泻症状
   不支持依据：信息不足

【居家护理建议】
可做：确保饮水，观察精神状态
禁止：禁止自行使用止泻药`
  } else {
    content = `【初步判断】
基于当前信息，症状不够典型，暂无法给出明确的初步判断。
建议补充更多症状细节（持续时间、频率、饮食变化等），或直接前往宠物医院就诊。`
  }

  return Promise.resolve({
    success: true,
    content,
    error: null,
    usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
    switchedModel: false,
  })
}
