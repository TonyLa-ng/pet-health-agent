'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [species, setSpecies] = useState<'犬' | '猫'>('犬')

  const startConsultation = () => {
    router.push(`/diagnose?species=${species}`)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
      {/* Hero */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
          🐾 宠物健康预诊助手
        </h1>
        <p className="mt-3 text-zinc-500">
          基于权威兽医知识库，为你的毛孩子提供严谨、透明的初步症状分析
        </p>
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>⚠️ 重要提示：</strong>本工具仅提供基于公开兽医知识的初步参考，不能替代执业兽医的当面诊断与检查。
        如宠物出现急症（抽搐、呼吸困难、大量出血、无法站立等），请立即前往 24 小时宠物医院急诊。
      </div>

      {/* Quick Start */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-800">开始问诊</h2>

        <div className="mt-4">
          <label className="block text-sm font-medium text-zinc-600">选择宠物类型</label>
          <div className="mt-2 flex gap-3">
            {(['犬', '猫'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpecies(s)}
                className={`rounded-full px-6 py-2.5 text-sm font-medium transition ${
                  species === s
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {s === '犬' ? '🐕 犬' : '🐈 猫'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={startConsultation}
          className="mt-6 w-full rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
        >
          开始问诊
        </button>

        <p className="mt-3 text-xs text-zinc-400">
          当前知识库覆盖：犬猫多系统常见疾病、急症与中毒风险（持续扩展中）
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { emoji: '🔍', title: '结构化追问', desc: '不遗漏关键信息' },
          { emoji: '📋', title: '可溯源诊断', desc: '基于兽医知识库' },
          { emoji: '⚠️', title: '急症实时预警', desc: '危险立即提醒' },
        ].map((f) => (
          <div key={f.title} className="rounded-lg border border-zinc-200 bg-white p-4 text-center">
            <div className="text-2xl">{f.emoji}</div>
            <h3 className="mt-2 text-sm font-semibold text-zinc-800">{f.title}</h3>
            <p className="mt-1 text-xs text-zinc-400">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
