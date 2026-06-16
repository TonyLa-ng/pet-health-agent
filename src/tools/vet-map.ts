export interface VetHospital {
  name: string
  address: string
  latitude: number
  longitude: number
}

export type VetMapSearchResult =
  | {
      status: 'ok'
      hospitals: VetHospital[]
      query: string
      message?: string
    }
  | {
      status: 'needs_location' | 'error'
      hospitals: VetHospital[]
      query?: string
      message: string
    }

interface VetMapSearchInput {
  locationText?: string
  fetchImpl?: typeof fetch
  limit?: number
}

interface NominatimPlace {
  display_name?: string
  lat?: string
  lon?: string
  name?: string
}

const LOCATION_PATTERN = /([\u4e00-\u9fff]{2,}(?:省|市|区|县|镇|乡|路|街|巷|号|大学|医院|广场|地铁站|车站|机场|附近))/

export async function findNearbyVetHospitals(input: VetMapSearchInput = {}): Promise<VetMapSearchResult> {
  const location = extractUsableLocation(input.locationText || '')
  if (!location) {
    return {
      status: 'needs_location',
      hospitals: [],
      message: '需要城市、区县或附近地标，才能查询可就诊的动物医院地址。',
    }
  }

  const limit = input.limit ?? 5
  const query = `${location} 动物医院 宠物医院 24小时`
  const endpoint = buildSearchUrl(query, limit)

  try {
    const fetcher = input.fetchImpl || fetch
    const response = await fetcher(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pet-health-agent/1.0',
      },
    })

    if (!response.ok) {
      return {
        status: 'error',
        hospitals: [],
        query,
        message: `地图搜索失败（HTTP ${response.status}），请直接搜索“${location} 24小时宠物医院”。`,
      }
    }

    const places = await response.json() as NominatimPlace[]
    const hospitals = places
      .map(normalizePlace)
      .filter((hospital): hospital is VetHospital => hospital !== null)
      .slice(0, limit)

    if (hospitals.length === 0) {
      return {
        status: 'error',
        hospitals: [],
        query,
        message: `没有查到可用地址，请直接搜索“${location} 24小时宠物医院”或联系附近宠物急诊。`,
      }
    }

    return { status: 'ok', hospitals, query }
  } catch {
    return {
      status: 'error',
      hospitals: [],
      query,
      message: `地图搜索网络异常，请直接搜索“${location} 24小时宠物医院”。`,
    }
  }
}

function extractUsableLocation(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''

  const explicit = trimmed.match(LOCATION_PATTERN)
  if (explicit) return explicit[1]

  if (/^[\u4e00-\u9fffA-Za-z\s-]{2,30}$/.test(trimmed)) {
    return trimmed
  }

  return ''
}

function buildSearchUrl(query: string, limit: number): string {
  const customEndpoint = process.env.MAP_SEARCH_ENDPOINT
  const encoded = encodeURIComponent(query)

  if (customEndpoint) {
    const separator = customEndpoint.includes('?') ? '&' : '?'
    return `${customEndpoint}${separator}q=${encoded}&format=json&limit=${limit}`
  }

  return `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=${limit}&addressdetails=1`
}

function normalizePlace(place: NominatimPlace): VetHospital | null {
  const address = place.display_name?.trim()
  const latitude = place.lat ? Number.parseFloat(place.lat) : Number.NaN
  const longitude = place.lon ? Number.parseFloat(place.lon) : Number.NaN

  if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null
  }

  return {
    name: inferHospitalName(place.name, address),
    address,
    latitude,
    longitude,
  }
}

function inferHospitalName(name: string | undefined, address: string): string {
  if (name?.trim()) return name.trim()
  return address.split(',')[0]?.trim() || '动物医院'
}
