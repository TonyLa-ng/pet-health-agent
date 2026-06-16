import { beforeEach, describe, expect, it } from 'vitest'
import { POST } from '../route'
import { clearStore, createProfileWithId, getProfile } from '@/store/profile'
import { clearRateLimits, clearSessions } from '@/store/session'

function request(body: unknown): Request {
  return new Request('http://localhost/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': 'route-test',
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  clearStore()
  clearSessions()
  clearRateLimits()
})

describe('POST /api/sessions', () => {
  it('should reject unsupported species with 400 instead of 500', async () => {
    const response = await POST(request({ petId: 'pet-demo', species: 'horse' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('species'),
    })
  })

  it('should normalize dog and cat aliases from the client entry route', async () => {
    const catResponse = await POST(request({ petId: 'pet-demo-cat', species: 'cat' }))
    const dogResponse = await POST(request({ petId: 'pet-demo-dog', species: 'dog' }))

    expect(catResponse.status).toBe(200)
    expect(dogResponse.status).toBe(200)
    expect(getProfile('pet-demo-cat')?.species).toBe('猫')
    expect(getProfile('pet-demo-dog')?.species).toBe('犬')
  })

  it('should reject reusing an existing profile from the wrong species module', async () => {
    createProfileWithId('shared-demo', {
      species: '犬',
      breed: '金毛',
      age: 3,
      weight: 25,
      gender: 'male',
      neutered: true,
      vaccination: '已完成基础免疫',
      medicalHistory: '无',
      allergies: '无',
      chronicConditions: '无',
    })

    const response = await POST(request({ petId: 'shared-demo', species: '猫' }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toMatch(/犬.*猫|猫.*犬|切换/)
  })

  it('should not count invalid requests against the create-session rate limit', async () => {
    for (let i = 0; i < 6; i++) {
      const invalid = await POST(request({ petId: 'pet-demo', species: 'horse' }))
      expect(invalid.status).toBe(400)
    }

    const valid = await POST(request({ petId: 'pet-demo', species: '犬' }))

    expect(valid.status).toBe(200)
  })

  it('should not limit active sessions (rate limiting disabled for dev)', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await POST(request({ petId: 'pet-demo', species: '犬' }))
      expect(response.status).toBe(200)
    }
  })

  it('should reuse the latest active session when requested', async () => {
    const first = await POST(request({ petId: 'pet-demo', species: '犬' }))
    let latestBody = await first.json()

    for (let i = 0; i < 2; i++) {
      const response = await POST(request({ petId: 'pet-demo', species: '犬' }))
      expect(response.status).toBe(200)
      latestBody = await response.json()
    }

    const reused = await POST(request({ petId: 'pet-demo', species: '犬', reuseActive: true }))
    const reusedBody = await reused.json()

    expect(reused.status).toBe(200)
    expect(reusedBody.sessionId).toBe(latestBody.sessionId)
  })
})
