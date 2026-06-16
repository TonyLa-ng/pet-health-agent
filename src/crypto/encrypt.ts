// ============================================
// Crypto Utilities — AES-256-GCM 加密/解密
// ============================================

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * 获取加密密钥（从环境变量）
 */
function getKey(): Buffer {
  const keyStr = process.env.ENCRYPTION_KEY
  if (!keyStr) {
    // MVP 阶段：无密钥时使用默认密钥（仅开发环境）
    return crypto.createHash('sha256').update('pet-health-agent-dev-key').digest()
  }
  return Buffer.from(keyStr, 'base64')
}

/**
 * 加密文本
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf-8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // 格式: iv:authTag:ciphertext (全部 hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * 解密文本
 */
export function decrypt(encryptedData: string): string {
  const key = getKey()
  const parts = encryptedData.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format')
  }

  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = parts[2]

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf-8')
  decrypted += decipher.final('utf-8')

  return decrypted
}

/**
 * 脱敏：宠物名 → 仅保留首字
 */
export function maskName(name: string): string {
  if (!name) return ''
  return name.slice(0, 1) + '*'.repeat(Math.max(0, name.length - 1))
}

/**
 * 生成唯一 ID
 */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
}
