// ============================================
// POST /api/sessions/:id/messages — SSE 流式返回
// ============================================

import { NextResponse } from 'next/server'
import { getSession, acquireLock, releaseLock, transition } from '@/store/session'
// checkRateLimit import removed — rate limiting disabled for dev
import { runPipeline } from '@/agent/pipeline'
import { SessionState } from '@/agent/types'
import { isReadOnly } from '@/store/session'
import { logger } from '@/monitoring/logger'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params
  const ip = request.headers.get('x-forwarded-for') || 'unknown'

  // 获取会话
  const session = getSession(sessionId)
  if (!session) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 })
  }
  if (session.state === SessionState.EXPIRED) {
    return NextResponse.json({ error: '会话已过期，请重新开始问诊' }, { status: 410 })
  }
  if (isReadOnly(session)) {
    return NextResponse.json({ error: '该会话已归档，仅支持查看报告' }, { status: 403 })
  }

  const body = await request.json().catch((): Record<string, unknown> => ({})) as Record<string, unknown>
  const text = body.text

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: '缺少 text 参数' }, { status: 400 })
  }

  // 接口限流（登录用户 15次/分钟）— 开发阶段已禁用
  // const rateLimit = checkRateLimit(`msg:${ip}`, 15)
  // if (!rateLimit.allowed) {
  //   return NextResponse.json(
  //     { error: '请求过于频繁', retryAfter: rateLimit.retryAfter },
  //     { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter || 2) } }
  //   )
  // }
  void ip; // 保留引用避免 lint 警告

  // 会话锁 — 开发阶段已禁用
  // if (!acquireLock(sessionId)) {
  //   return NextResponse.json(
  //     { error: '会话正在处理中，请稍后重试', retryAfter: 2 },
  //     { status: 429, headers: { 'Retry-After': '2' } }
  //   )
  // }
  void acquireLock; void sessionId; // 保留引用避免 lint 警告

  try {
    // 添加用户消息到历史
    session.history.push({ role: 'user', content: text, timestamp: Date.now() })

    // 根据当前状态决定流程
    if (session.state === SessionState.CREATED) {
      // 首次交互 → 推进到症状采集
      transition(session, SessionState.COLLECTING)
    } else if (session.state === SessionState.PROFILING) {
      transition(session, SessionState.COLLECTING)
    }

    // 执行问诊管道
    const { output, session: updatedSession } = await runPipeline(session, text)

    // 添加 Agent 回复到历史
    const reportContent = output.report
      ? output.report.sections.map((s) => s.content).join('\n')
      : output.interview
        ? output.interview.questions.map((q) => `${q.question}（${q.guidance}）`).join('\n')
        : ''

    if (reportContent) {
      updatedSession.history.push({ role: 'agent', content: reportContent, timestamp: Date.now() })
    }

    releaseLock(sessionId)

    return NextResponse.json({
      sessionId,
      state: updatedSession.state,
      triage: output.triage,
      interview: output.interview,
      report: output.report,
      sseEvents: output.sseEvents,
    })
  } catch (err: unknown) {
    releaseLock(sessionId)
    const message = err instanceof Error ? err.message : String(err)
    logger.error('Pipeline error', { sessionId, error: message })
    return NextResponse.json(
      { error: '问诊处理失败，请稍后重试' },
      { status: 500 }
    )
  }
}
