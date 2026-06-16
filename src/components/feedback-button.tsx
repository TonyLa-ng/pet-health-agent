'use client'

import { useState } from 'react'

type FeedbackType = 'accurate' | 'inaccurate' | 'emergency_misjudge' | 'insufficient_info'

const FEEDBACK_OPTIONS: { type: FeedbackType; label: string; emoji: string }[] = [
  { type: 'accurate', label: '诊断准确', emoji: '👍' },
  { type: 'inaccurate', label: '诊断不准确', emoji: '👎' },
  { type: 'emergency_misjudge', label: '误判急症', emoji: '⚠️' },
  { type: 'insufficient_info', label: '信息不足', emoji: '❓' },
]

interface FeedbackButtonProps {
  sessionId: string
}

export default function FeedbackButton({ sessionId }: FeedbackButtonProps) {
  const [selected, setSelected] = useState<FeedbackType | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const handleSelect = (type: FeedbackType) => {
    setSelected(type)
    setSubmitted(true)
    // MVP 阶段：console 记录反馈（后续接 API）
    console.log('Feedback:', { sessionId, feedbackType: type })
  }

  if (submitted) {
    return (
      <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-3 text-center text-sm font-medium text-emerald-700">
        ✅ 感谢你的反馈！
      </div>
    )
  }

  return (
    <div className="flex-1">
      <p className="mb-2 text-sm text-zinc-500">此诊断是否准确？</p>
      <div className="flex gap-2">
        {FEEDBACK_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            onClick={() => handleSelect(opt.type)}
            className={`flex-1 rounded-lg border px-3 py-2 text-center text-xs transition ${
              selected === opt.type
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
            }`}
            title={opt.label}
          >
            <span className="block text-lg">{opt.emoji}</span>
            <span className="mt-0.5 block">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
