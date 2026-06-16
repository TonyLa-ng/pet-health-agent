import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pet Health Agent — 宠物健康预诊助手',
  description: '基于权威兽医知识库的宠物健康预诊助手，仅面向犬猫类宠物提供症状分析与诊疗参考建议',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50">
        <header className="border-b border-zinc-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <Link href="/" className="text-lg font-bold text-emerald-700">
              🐾 Pet Health Agent
            </Link>
            <span className="text-xs text-zinc-400">宠物健康预诊助手</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  )
}
