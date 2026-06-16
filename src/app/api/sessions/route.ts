// ============================================
// POST /api/sessions — 创建问诊会话
// ============================================

import { NextResponse } from 'next/server'
import { createSession, getActiveSessionCount, getLatestActiveSession } from '@/store/session'
// checkSessionCreateLimit import removed — rate limiting disabled for dev
import { getProfile, createProfileWithId } from '@/store/profile'
import { logger } from '@/monitoring/logger'
import { normalizeConsultSpecies, speciesDisplayName } from '@/species'

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const body = await request.json().catch((): Record<string, unknown> => ({})) as Record<string, unknown>
  const petId = typeof body.petId === 'string' ? body.petId : ''
  const species = normalizeConsultSpecies(body.species ?? '犬')
  const reuseActive = body.reuseActive === true

  if (!petId) {
    return NextResponse.json(
      { error: '缺少 petId 参数' },
      { status: 400 }
    )
  }

  if (!species) {
    return NextResponse.json(
      { error: 'species 仅支持 犬/狗/dog 或 猫/cat' },
      { status: 400 }
    )
  }

  const existingPet = getProfile(petId)
  if (existingPet && existingPet.species !== species) {
    return NextResponse.json(
      {
        error: `当前宠物档案是${speciesDisplayName(existingPet.species)}，但你打开的是${speciesDisplayName(species)}问诊入口。请切换到${speciesDisplayName(existingPet.species)}入口，或使用${speciesDisplayName(species)}档案重新开始。`,
      },
      { status: 409 }
    )
  }

  // 限流检查（会话创建限流 + IP 限流）— 开发阶段已禁用
  // const createLimit = checkSessionCreateLimit(ip)
  // if (!createLimit.allowed) {
  //   return NextResponse.json(
  //     { error: '创建会话过于频繁，请稍后重试', retryAfter: createLimit.retryAfter },
  //     { status: 429 }
  //   )
  // }
  void ip; // 保留引用避免 lint 警告

  try {
    // 验证宠物存在，不存在则自动创建 demo 档案
    let pet = existingPet
    if (!pet) {
      pet = createProfileWithId(petId, {
        species,
        breed: species === '猫' ? '英短' : '金毛',
        age: 3,
        weight: species === '猫' ? 4 : 25,
        gender: 'male',
        neutered: true,
        vaccination: '已完成基础免疫',
        medicalHistory: '无',
        allergies: '无',
        chronicConditions: '无',
      })
      logger.info('Auto-created demo profile', { petId: pet.id, species })
    }

    if (reuseActive) {
      const activeSession = getLatestActiveSession(pet.id)
      if (activeSession) {
        return NextResponse.json({
          sessionId: activeSession.id,
          state: activeSession.state,
          species: pet.species,
          createdAt: activeSession.createdAt,
        })
      }
    }

    // 单只宠物活跃会话数限制 ≤ 3；过期会话会在统计时自动剔除 — 开发阶段已禁用
    // const activeCount = getActiveSessionCount(pet.id)
    // if (activeCount >= 3) {
    //   return NextResponse.json(
    //     { error: '同时进行的问诊会话已达上限（3个），请先完成或关闭进行中的问诊' },
    //     { status: 429 }
    //   )
    // }
    void getActiveSessionCount; // 保留引用避免 lint 警告

    const session = createSession(pet.id)
    logger.info('Session created', { sessionId: session.id, petId: pet.id })

    return NextResponse.json({
      sessionId: session.id,
      state: session.state,
      species: pet.species,
      createdAt: session.createdAt,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('Failed to create session', { error: message })
    return NextResponse.json(
      { error: '创建会话失败' },
      { status: 500 }
    )
  }
}
