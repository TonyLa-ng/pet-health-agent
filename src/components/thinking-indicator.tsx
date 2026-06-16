'use client'

import { useEffect, useState } from 'react'

const STAGES = [
  { label: '正在检索知识库', emoji: '🔍', duration: 1500 },
  { label: '正在分析症状', emoji: '🧠', duration: 2000 },
  { label: '正在生成报告', emoji: '📋', duration: 1500 },
]

interface ThinkingIndicatorProps {
  /** 是否在加载中 */
  active: boolean
}

export default function ThinkingIndicator({ active }: ThinkingIndicatorProps) {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStage(0)
      return
    }

    let currentStage = 0
    const advanceStage = () => {
      currentStage++
      if (currentStage < STAGES.length) {
        setStage(currentStage)
        setTimeout(advanceStage, STAGES[currentStage].duration)
      }
    }

    const timer = setTimeout(advanceStage, STAGES[0].duration)
    return () => {
      clearTimeout(timer)
      setStage(0)
    }
  }, [active])

  if (!active) return null

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      {/* Spinner */}
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-200 border-t-emerald-600" />

      {/* Stage label */}
      <div className="text-center">
        <p className="text-lg">
          {STAGES[stage]?.emoji} {STAGES[stage]?.label}
        </p>
        <p className="mt-1 text-xs text-zinc-400">请稍候，这可能需要几秒钟</p>
      </div>

      {/* Progress dots */}
      <div className="flex gap-2">
        {STAGES.map((_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full transition-colors ${
              i <= stage ? 'bg-emerald-500' : 'bg-zinc-200'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
