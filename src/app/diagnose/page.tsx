'use client'

import { useState, useRef, useEffect, Suspense, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import ThinkingIndicator from '@/components/thinking-indicator'
import { defaultDemoPetIdForSpecies, normalizeConsultSpecies } from '@/species'

interface SessionData {
  sessionId: string
  state: string
  triage?: ApiResponse['triage']
  interview?: ApiResponse['interview']
  report?: ApiReport
}

interface ApiSSEEvent {
  section: string
  data?: {
    message?: string
  }
}

interface ApiReportSection {
  type?: string
  title: string
  content: string
}

interface ApiReport {
  template?: string
  source?: 'knowledge_base' | 'llm_fallback' | 'web_search'
  sections: ApiReportSection[]
  disclaimerText?: string
}

interface ApiInterviewQuestion {
  question: string
  guidance?: string
}

interface ApiResponse {
  state?: string
  triage?: {
    level?: string
    alerts?: string[]
    matchedSignals?: string[]
  }
  interview?: {
    questions?: ApiInterviewQuestion[]
  }
  report?: ApiReport
  sseEvents?: ApiSSEEvent[]
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  const payload = await res.json().catch((): Record<string, unknown> => ({}))
  return typeof payload.error === 'string' ? payload.error : fallback
}

function formatReport(report: ApiReport): string {
  const modeLabel = report.source === 'knowledge_base'
    ? '[AI 诊断 - 知识库匹配]'
    : report.source === 'web_search'
      ? '[AI 诊断 - 联网搜索增强]'
      : '[AI 诊断 - 通用模型兜底]'

  const reportText = report.sections
    .map((section) => `【${section.title}】\n${section.content}`)
    .join('\n\n')

  return `${modeLabel}\n${reportText}\n\n${report.disclaimerText || ''}`.trim()
}

function formatQuestions(questions: ApiInterviewQuestion[]): string {
  return questions
    .map((question) => {
      const guidance = question.guidance ? `\n（${question.guidance}）` : ''
      return `${question.question}${guidance}`
    })
    .join('\n\n')
}

function formatCriticalTriage(triage: ApiResponse['triage']): string {
  const alerts = triage?.alerts?.length
    ? triage.alerts.join('\n')
    : '检测到危重急症信号，请立即联系或前往附近宠物医院。'
  const signals = triage?.matchedSignals?.length
    ? `\n\n触发信号：${triage.matchedSignals.join('、')}`
    : ''
  return `【急症预警】\n${alerts}${signals}`
}

function DiagnoseContent() {
  const searchParams = useSearchParams()
  const species = normalizeConsultSpecies(searchParams.get('species')) || '犬'
  const petId = searchParams.get('petId') || defaultDemoPetIdForSpecies(species)

  const [session, setSession] = useState<SessionData | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<{ role: string; content: string }>>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  const createSession = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId, species, reuseActive: true }),
      })

      if (!res.ok) {
        const message = await readApiError(res, `创建问诊会话失败（HTTP ${res.status}）`)
        setError(message)
        setSession(null)
        return
      }

      const data = await res.json()
      setSession(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`无法连接问诊服务：${message}`)
      setSession(null)
    }
  }, [petId, species])

  useEffect(() => {
    createSession()
  }, [createSession])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading])

  const processResponse = (data: ApiResponse) => {
    setSession((current) => current
      ? {
          ...current,
          state: data.state || current.state,
          triage: data.triage || current.triage,
          interview: data.interview || current.interview,
          report: data.report || current.report,
        }
      : current)

    const errorEvent = data.sseEvents?.find((event) => event.section === 'error')
    if (errorEvent) {
      const message = errorEvent.data?.message || '问诊处理失败，请修改描述后重试。'
      setError(message)
      setHistory((items) => [...items, { role: 'agent', content: message }])
      setLoading(false)
      return
    }

    if (data.report) {
      setHistory((items) => [...items, { role: 'agent', content: formatReport(data.report!) }])
    } else if ((data.interview?.questions?.length || 0) > 0) {
      setHistory((items) => [
        ...items,
        { role: 'agent', content: formatQuestions(data.interview?.questions || []) },
      ])
    } else if (data.triage?.level === 'critical') {
      setHistory((items) => [...items, { role: 'agent', content: formatCriticalTriage(data.triage) }])
    } else {
      setHistory((items) => [
        ...items,
        { role: 'agent', content: '已收到补充信息，后端暂未返回新的追问或报告。' },
      ])
    }

    setLoading(false)
  }

  const handleSend = async () => {
    if (!input.trim() || !session || loading) return

    const userText = input.trim()
    setInput('')
    setHistory((items) => [...items, { role: 'user', content: userText }])
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/sessions/${session.sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText }),
      })

      if (!res.ok) {
        const message = await readApiError(res, `问诊接口返回错误（HTTP ${res.status}）`)
        setError(message)
        setHistory((items) => [...items, { role: 'agent', content: message }])
        setLoading(false)
        return
      }

      const data = await res.json()
      processResponse(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const display = `无法连接问诊服务：${message}`
      setError(display)
      setHistory((items) => [...items, { role: 'agent', content: display }])
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isComplete =
    session?.state === 'reported' ||
    session?.state === 'emergency_triggered' ||
    session?.state === 'incomplete'

  const report = session?.report

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">
          当前咨询: {species === '犬' ? '犬' : '猫'}
        </span>
        {session?.state && (
          <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs text-zinc-500">
            {session.state}
          </span>
        )}
      </div>

      {session?.triage?.level === 'critical' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {formatCriticalTriage(session.triage)}
        </div>
      )}

      <div className="flex-1 space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm min-h-[300px] max-h-[500px] overflow-y-auto">
        {history.length === 0 && !loading && (
          <div className="py-12 text-center text-zinc-400">
            <p className="text-3xl">🐾</p>
            <p className="mt-2">请描述宠物的症状，我会交给后端问诊系统进行分析</p>
            <p className="mt-1 text-xs">例如：狗昨天开始吐了三次，食欲下降，精神也不好</p>
          </div>
        )}

        {history.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-100 text-zinc-800'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && <ThinkingIndicator active={true} />}

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        <div ref={chatEndRef} />
      </div>

      {!isComplete && (
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述宠物的症状..."
            disabled={loading || !session}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-zinc-100"
          />
          <button
            onClick={handleSend}
            disabled={!session || !input.trim() || loading}
            className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:bg-zinc-300"
          >
            {loading ? '...' : '发送'}
          </button>
        </div>
      )}

      {isComplete && report && (
        <Link
          href={`/report?sessionId=${session?.sessionId || ''}`}
          className="block w-full rounded-lg bg-emerald-600 px-6 py-3 text-center text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          查看完整诊断报告
        </Link>
      )}

      {isComplete && !report && (
        <Link
          href="/"
          className="block w-full rounded-lg border border-zinc-300 bg-white px-6 py-3 text-center text-base font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          返回首页
        </Link>
      )}
    </div>
  )
}

export default function DiagnosePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-zinc-400">加载中...</div>}>
      <DiagnoseContent />
    </Suspense>
  )
}
