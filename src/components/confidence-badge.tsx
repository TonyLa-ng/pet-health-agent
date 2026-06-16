'use client'

interface ConfidenceBadgeProps {
  confidence: number
  size?: 'sm' | 'md' | 'lg'
}

const BADGE_CONFIG = {
  green: { emoji: '🟢', label: '高', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  yellow: { emoji: '🟡', label: '中', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  orange: { emoji: '🟠', label: '低', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  red: { emoji: '🔴', label: '极低', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
}

function getBadgeLevel(confidence: number): keyof typeof BADGE_CONFIG {
  if (confidence >= 80) return 'green'
  if (confidence >= 65) return 'yellow'
  if (confidence >= 50) return 'orange'
  return 'red'
}

export default function ConfidenceBadge({ confidence, size = 'md' }: ConfidenceBadgeProps) {
  const level = getBadgeLevel(confidence)
  const config = BADGE_CONFIG[level]

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-3 py-1 text-sm gap-1.5',
    lg: 'px-4 py-2 text-base gap-2',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.border} ${config.bg} ${sizeClasses[size]} font-medium ${config.color}`}
      title={`置信度: ${confidence}%`}
    >
      {config.emoji} {config.label} {confidence}%
    </span>
  )
}
