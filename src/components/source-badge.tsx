'use client'

interface SourceBadgeProps {
  source: 'knowledge_base' | 'llm_fallback'
}

export default function SourceBadge({ source }: SourceBadgeProps) {
  if (source === 'knowledge_base') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        🟢 知识库匹配
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
      🌐 联网分析 · 请自行判断准确性
    </span>
  )
}
