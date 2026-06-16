'use client'

interface EmergencyAlertProps {
  score: number
  alerts: string[]
  matchedSignals: string[]
}

export default function EmergencyAlert({ score, alerts, matchedSignals }: EmergencyAlertProps) {
  return (
    <div className="rounded-xl border-2 border-red-500 bg-red-50 p-6 shadow-lg">
      <div className="flex items-center gap-3">
        <span className="text-3xl">⚠️</span>
        <div>
          <h2 className="text-xl font-bold text-red-700">紧急就医预警</h2>
          <p className="text-sm text-red-600">
            急症评分: {score}/100 — 匹配信号: {matchedSignals.join('、')}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-white p-4">
        <p className="font-semibold text-red-800">
          根据你描述的症状，属于宠物急症范畴，存在较高健康风险。
        </p>
        <p className="mt-2 text-lg font-bold text-red-700">
          请 <span className="underline">立即</span> 携带宠物前往正规 24 小时宠物医院急诊
        </p>
        <p className="mt-1 text-red-600">不要自行处理或等待观察。</p>
      </div>

      {alerts.length > 0 && (
        <div className="mt-4 space-y-2">
          {alerts.map((alert, i) => (
            <p key={i} className="text-sm text-red-700">
              {alert}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-lg bg-red-100 p-3">
        <p className="text-sm font-medium text-red-800">常见急症处理注意事项：</p>
        <ul className="mt-1 list-inside list-disc text-sm text-red-700">
          <li>保持宠物呼吸通畅</li>
          <li>避免按压宠物腹部</li>
          <li>尽快送往最近的正规宠物医院</li>
          <li>路途中注意保暖和安静</li>
        </ul>
      </div>
    </div>
  )
}
