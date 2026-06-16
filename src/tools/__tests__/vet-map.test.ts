import { describe, expect, it, vi } from 'vitest'
import { findNearbyVetHospitals } from '../vet-map'

describe('Vet hospital map search tool', () => {
  it('normalizes concrete nearby veterinary hospital addresses from map search results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          display_name: '安心动物医院, 张江路88号, 浦东新区, 上海市, 中国',
          lat: '31.203',
          lon: '121.601',
          name: '安心动物医院',
        },
        {
          display_name: '24小时宠物急诊中心, 科苑路200号, 浦东新区, 上海市, 中国',
          lat: '31.210',
          lon: '121.590',
          name: '24小时宠物急诊中心',
        },
      ],
    })

    const result = await findNearbyVetHospitals({
      locationText: '上海市浦东新区张江',
      fetchImpl: fetchMock,
    })

    expect(fetchMock).toHaveBeenCalled()
    expect(result.status).toBe('ok')
    expect(result.hospitals).toHaveLength(2)
    expect(result.hospitals[0]).toMatchObject({
      name: '安心动物医院',
      address: '安心动物医院, 张江路88号, 浦东新区, 上海市, 中国',
      latitude: 31.203,
      longitude: 121.601,
    })
  })

  it('asks for location when there is no usable city or district text', async () => {
    const result = await findNearbyVetHospitals({ locationText: '' })

    expect(result.status).toBe('needs_location')
    expect(result.message).toMatch(/城市|区县|附近地标/)
  })
})
