'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import ConfidenceBadge from '@/components/confidence-badge'
import FeedbackButton from '@/components/feedback-button'
import SourceBadge from '@/components/source-badge'

interface DemoSection {
  type: 'pet_info' | 'symptom_summary' | 'diagnosis' | 'differential' | 'home_care' | 'emergency_signs'
  title: string
  content: string
  metadata?: {
    topConfidence?: number
  }
}

const DEMO_SECTIONS: DemoSection[] = [
  {
    type: 'pet_info',
    title: '宠物基础信息',
    content: '品种：金毛  年龄：3岁  体重：25kg  免疫情况：已完成基础免疫  既往病史：无',
  },
  {
    type: 'symptom_summary',
    title: '本次症状梳理',
    content: '主要症状：呕吐、食欲下降、精神萎靡\n伴随症状：无\n持续时间：一天\n发作模式：持续',
  },
  {
    type: 'diagnosis',
    title: '初步判断（按可能性排序）',
    content:
      '1. 急性胃炎  置信度：85%  🟢\n   支持依据：呕吐+食欲下降+精神萎靡与急性胃炎高度吻合\n   不支持依据：无血便、无高烧，暂不支持细小病毒感染',
    metadata: { topConfidence: 85 },
  },
  {
    type: 'differential',
    title: '鉴别诊断与建议检查',
    content:
      '- 与肠道异物的区别：需确认是否有吞食异物史，X光/B超可确诊\n- 与胰腺炎的区别：需确认是否进食高脂肪食物，血液生化可鉴别',
  },
  {
    type: 'home_care',
    title: '居家护理建议',
    content:
      '可做：\n- 短期禁食12-24小时，确保充足饮水\n- 恢复进食时从少量易消化食物开始（白水煮鸡胸肉+米饭，少量多餐）\n\n禁止：\n- 禁止使用人用止吐药\n- 禁止强行灌食或灌水\n- 禁止喂食洋葱、大蒜、巧克力、葡萄等对犬有毒食物\n- 禁食超过24小时需兽医指导',
  },
  {
    type: 'emergency_signs',
    title: '紧急就医指征',
    content:
      '出现以下任意情况请立即就医：\n1. 24小时内呕吐超过5次\n2. 呕吐物带血或咖啡渣样\n3. 伴发高热（>39.5℃）\n4. 精神极度萎靡、无法站立\n5. 禁食24小时后症状无好转',
  },
]

const DEMO_DISCLAIMER =
  '免责声明：以上内容仅为基于公开兽医知识的初步参考，不能替代执业兽医的当面诊断与检查。若症状持续或加重，请立即前往正规宠物医院就诊。'

interface DemoReport {
  template: string
  sections: DemoSection[]
  disclaimerText: string
  source: 'knowledge_base' | 'llm_fallback'
  generatedAt?: number
}

function hasTopConfidence(section: DemoSection): section is DemoSection & { metadata: { topConfidence: number } } {
  return section.type === 'diagnosis' && typeof section.metadata?.topConfidence === 'number'
}

function ReportContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('sessionId') || 'demo'

  const report: DemoReport = {
    template: 'template_1',
    sections: DEMO_SECTIONS,
    disclaimerText: DEMO_DISCLAIMER,
    source: 'knowledge_base',
  }

  const getSectionStyle = (type: string) => {
    switch (type) {
      case 'emergency_signs':
        return 'border-red-300 bg-red-50'
      case 'diagnosis':
        return 'border-emerald-300 bg-emerald-50'
      case 'home_care':
        return 'border-blue-300 bg-blue-50'
      default:
        return 'border-zinc-200 bg-white'
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-zinc-900">📋 诊断报告</h1>
          <SourceBadge source={report.source} />
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          会话 ID: {sessionId}
          {report.generatedAt
            ? ` · 生成时间: ${new Date(report.generatedAt).toLocaleString('zh-CN')}`
            : ''}
        </p>
      </div>

      {report.sections
        .filter(hasTopConfidence)
        .map((s, i) => (
          <div key={i} className="mb-4 flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-600">综合置信度:</span>
            <ConfidenceBadge confidence={s.metadata.topConfidence} size="lg" />
          </div>
        ))}

      <div className="space-y-4">
        {report.sections.map((section, i) => (
          <div
            key={i}
            className={`rounded-xl border p-5 ${getSectionStyle(section.type)}`}
          >
            <h2 className="mb-3 text-base font-bold text-zinc-800">{section.title}</h2>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-700">
              {section.content}
            </pre>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm leading-relaxed text-amber-800">{report.disclaimerText}</p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <FeedbackButton sessionId={sessionId} />
        <Link
          href="/diagnose?species=犬"
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-6 py-3 text-center text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          发起新问诊
        </Link>
      </div>

      <p className="mt-8 text-center text-xs text-zinc-400">
        Pet Health Agent v0.1 · MVP 阶段 · 仅供初步参考
      </p>
    </div>
  )
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-zinc-400">加载中...</div>}>
      <ReportContent />
    </Suspense>
  )
}
