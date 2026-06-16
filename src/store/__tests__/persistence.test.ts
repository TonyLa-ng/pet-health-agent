import { describe, expect, it, vi } from 'vitest'

describe('In-memory store persistence across module reloads', () => {
  it('should keep sessions on globalThis when modules are reloaded', async () => {
    const sessionStore = await import('../session')
    sessionStore.clearSessions()

    const session = sessionStore.createSession('pet-global-session')

    vi.resetModules()
    const reloadedSessionStore = await import('../session')

    expect(reloadedSessionStore.getSession(session.id)?.petId).toBe('pet-global-session')
  })

  it('should keep profiles on globalThis when modules are reloaded', async () => {
    const profileStore = await import('../profile')
    profileStore.clearStore()

    const profile = profileStore.createProfile({
      species: '猫',
      breed: '英短',
      age: 3,
      weight: 4,
      gender: 'male',
      neutered: true,
      vaccination: '已完成基础免疫',
      medicalHistory: '无',
      allergies: '无',
      chronicConditions: '无',
    })

    vi.resetModules()
    const reloadedProfileStore = await import('../profile')

    expect(reloadedProfileStore.getProfile(profile.id)?.species).toBe('猫')
  })
})
