export interface WebSearchConfig {
  provider: string
  endpoint: string
  apiKey: string
  timeoutMs: number
  maxResults: number
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  publishedAt?: string
}

export interface WebSearchResponse {
  enabled: boolean
  provider: string
  query: string
  searchedAt: number
  results: WebSearchResult[]
  error?: string
}

interface WebSearchOptions {
  env?: Record<string, string | undefined>
  config?: Partial<WebSearchConfig>
  fetchImpl?: typeof fetch
}

export function getWebSearchConfig(
  env: Record<string, string | undefined> = process.env
): WebSearchConfig {
  return {
    provider: env.WEB_SEARCH_PROVIDER || 'generic',
    endpoint: env.WEB_SEARCH_ENDPOINT || '',
    apiKey: env.WEB_SEARCH_API_KEY || '',
    timeoutMs: parsePositiveInt(env.WEB_SEARCH_TIMEOUT_MS, 5000),
    maxResults: parsePositiveInt(env.WEB_SEARCH_MAX_RESULTS, 3),
  }
}

export async function webSearch(
  query: string,
  options: WebSearchOptions = {}
): Promise<WebSearchResponse> {
  const cfg = { ...getWebSearchConfig(options.env), ...options.config }
  const searchedAt = Date.now()

  if (!cfg.endpoint || !query.trim()) {
    return {
      enabled: false,
      provider: cfg.provider,
      query,
      searchedAt,
      results: [],
    }
  }

  const fetchImpl = options.fetchImpl || fetch
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs)

  try {
    const response = await fetchImpl(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        query,
        q: query,
        max_results: cfg.maxResults,
        maxResults: cfg.maxResults,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return {
        enabled: true,
        provider: cfg.provider,
        query,
        searchedAt,
        results: [],
        error: `search_http_${response.status}`,
      }
    }

    const data = await response.json()
    return {
      enabled: true,
      provider: cfg.provider,
      query,
      searchedAt,
      results: normalizeSearchResults(data).slice(0, cfg.maxResults),
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    const error = err instanceof Error ? err : new Error(String(err))
    return {
      enabled: true,
      provider: cfg.provider,
      query,
      searchedAt,
      results: [],
      error: error.name === 'AbortError' ? 'search_timeout' : error.message,
    }
  }
}

export function buildVeterinarySearchQuery(
  species: '犬' | '猫',
  symptoms: string[],
  rawUserText?: string
): string {
  const symptomText = symptoms.slice(0, 6).join(' ')
  const userText = rawUserText ? rawUserText.slice(0, 80) : ''
  return [species, symptomText, userText, '兽医', '宠物疾病', '急症处理']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatWebSearchContext(results: WebSearchResult[]): string {
  if (results.length === 0) return ''

  return results
    .map((result, index) => {
      const published = result.publishedAt ? ` | 发布时间: ${result.publishedAt}` : ''
      return `${index + 1}. ${result.title}\n   URL: ${result.url}${published}\n   摘要: ${result.snippet}`
    })
    .join('\n')
}

function normalizeSearchResults(data: unknown): WebSearchResult[] {
  const payload = isRecord(data) ? data : {}
  const webPages = isRecord(payload.webPages) ? payload.webPages : {}
  const rawResults =
    asArray(payload.results) ||
    asArray(payload.organic_results) ||
    asArray(webPages.value) ||
    asArray(payload.items) ||
    []

  return rawResults
    .map((item) => normalizeSearchItem(item))
    .filter((item): item is WebSearchResult => item !== null)
    .filter((item) => item.title && item.url)
}

function normalizeSearchItem(item: unknown): WebSearchResult | null {
  if (!isRecord(item)) return null

  return {
    title: readString(item, ['title', 'name']).trim(),
    url: readString(item, ['url', 'link']).trim(),
    snippet: readString(item, ['snippet', 'content', 'description']).trim(),
    publishedAt: readOptionalString(item, ['publishedAt', 'datePublished', 'published_at']),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  return readOptionalString(record, keys) || ''
}

function readOptionalString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string') return value
  }
  return undefined
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
