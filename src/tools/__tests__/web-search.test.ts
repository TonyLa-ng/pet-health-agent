import { describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import {
  buildVeterinarySearchQuery,
  formatWebSearchContext,
  getWebSearchConfig,
  webSearch,
} from '../web-search'

describe('webSearch', () => {
  it('should be disabled when endpoint is not configured', async () => {
    const result = await webSearch('犬 胃扭转 急症', {
      env: {},
      fetchImpl: vi.fn(),
    })

    expect(result.enabled).toBe(false)
    expect(result.results).toHaveLength(0)
  })

  it('should call a configured generic HTTP search endpoint and normalize results', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({
        results: [
          {
            title: 'Dogs and GDV',
            url: 'https://vet.example/gdv',
            content: 'GDV is an emergency in large breed dogs.',
          },
        ],
      }), { status: 200 })
    )

    const result = await webSearch('犬 胃扭转 急症', {
      env: {
        WEB_SEARCH_PROVIDER: 'generic',
        WEB_SEARCH_ENDPOINT: 'https://search.example/api',
        WEB_SEARCH_API_KEY: 'secret',
        WEB_SEARCH_MAX_RESULTS: '1',
      },
      fetchImpl,
    })

    expect(result.enabled).toBe(true)
    expect(result.provider).toBe('generic')
    expect(result.results).toEqual([
      {
        title: 'Dogs and GDV',
        url: 'https://vet.example/gdv',
        snippet: 'GDV is an emergency in large breed dogs.',
      },
    ])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://search.example/api',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
        }),
      })
    )
  })

  it('should fail closed and return an empty result set on network errors', async () => {
    const result = await webSearch('猫 百合花 中毒', {
      env: {
        WEB_SEARCH_ENDPOINT: 'https://search.example/api',
      },
      fetchImpl: vi.fn(async () => {
        throw new Error('network down')
      }),
    })

    expect(result.enabled).toBe(true)
    expect(result.results).toHaveLength(0)
    expect(result.error).toContain('network down')
  })

  it('should perform a real HTTP POST to a configured endpoint', async () => {
    let receivedBody = ''
    const server = createServer((request, response) => {
      request.on('data', (chunk) => {
        receivedBody += chunk.toString('utf8')
      })
      request.on('end', () => {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({
          results: [
            {
              title: 'Feline toxicology reference',
              url: 'https://vet.example/toxicology',
              snippet: 'Onion exposure can require urgent veterinary care.',
            },
          ],
        }))
      })
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('test server did not expose a port')
    }

    try {
      const result = await webSearch('犬 洋葱 中毒', {
        env: {
          WEB_SEARCH_ENDPOINT: `http://127.0.0.1:${address.port}/search`,
          WEB_SEARCH_MAX_RESULTS: '1',
        },
      })

      expect(JSON.parse(receivedBody)).toMatchObject({
        query: '犬 洋葱 中毒',
        max_results: 1,
      })
      expect(result.results[0]?.title).toBe('Feline toxicology reference')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('web search context helpers', () => {
  it('should build a veterinary-focused query from species and symptoms', () => {
    const query = buildVeterinarySearchQuery('猫', ['排尿困难', '精神萎靡'], '公猫尿不出来')

    expect(query).toContain('猫')
    expect(query).toContain('排尿困难')
    expect(query).toContain('兽医')
  })

  it('should format search results with source URLs for prompt injection', () => {
    const context = formatWebSearchContext([
      {
        title: 'Feline urinary obstruction',
        url: 'https://vet.example/feline-urinary',
        snippet: 'A blocked cat needs urgent veterinary care.',
      },
    ])

    expect(context).toContain('Feline urinary obstruction')
    expect(context).toContain('https://vet.example/feline-urinary')
    expect(context).toContain('A blocked cat needs urgent veterinary care.')
  })

  it('should parse numeric config safely', () => {
    const config = getWebSearchConfig({
      WEB_SEARCH_ENDPOINT: 'https://search.example/api',
      WEB_SEARCH_TIMEOUT_MS: 'abc',
      WEB_SEARCH_MAX_RESULTS: '2',
    })

    expect(config.timeoutMs).toBe(5000)
    expect(config.maxResults).toBe(2)
  })
})
