// ============================================
// GET /api/sessions/:id/report — 获取最终报告
// ============================================

import { NextResponse } from 'next/server'
import { getSession } from '@/store/session'
import { logger } from '@/monitoring/logger'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params

  const session = getSession(sessionId)
  if (!session) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 })
  }

  const report = session.context.report
  if (!report) {
    return NextResponse.json(
      { error: '报告尚未生成', state: session.state },
      { status: 404 }
    )
  }

  logger.info('Report accessed', { sessionId })

  return NextResponse.json({
    sessionId,
    state: session.state,
    report,
    generatedAt: report.generatedAt,
  })
}
