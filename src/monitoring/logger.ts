// ============================================
// Monitoring: Logger (pino wrapper)
// ============================================

const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

// 简化版 logger（MVP 阶段用 console，可替换为 pino）
const levels: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const currentLevel = levels[LOG_LEVEL] ?? 1

function formatLog(level: string, msg: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString()
  const metaStr = meta ? ' ' + JSON.stringify(meta) : ''
  return `[${timestamp}] ${level.toUpperCase()} ${msg}${metaStr}`
}

export const logger = {
  debug(msg: string, meta?: Record<string, unknown>) {
    if (currentLevel <= 0) console.debug(formatLog('debug', msg, meta))
  },
  info(msg: string, meta?: Record<string, unknown>) {
    if (currentLevel <= 1) console.info(formatLog('info', msg, meta))
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    if (currentLevel <= 2) console.warn(formatLog('warn', msg, meta))
  },
  error(msg: string, meta?: Record<string, unknown>) {
    if (currentLevel <= 3) console.error(formatLog('error', msg, meta))
  },
}
