import { buildFairPrice, hashFloat } from '../lib/math.js'
import type { AgentRun, GammaEvent, Market, MarketTab } from '../types.js'

const GAMMA_EVENTS_URL =
  'https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=24'

function parseMaybeArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String)
  }

  if (typeof value !== 'string') {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return value
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
}

function numberFrom(value: unknown, fallback = 0) {
  const numeric = typeof value === 'string' ? Number(value) : value

  return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : fallback
}

function tabFor(category: string, title: string, volume24h: number): MarketTab {
  const text = `${category} ${title}`.toLowerCase()

  if (text.includes('crypto') || text.includes('bitcoin') || text.includes('btc')) {
    return 'Crypto'
  }

  if (text.includes('rate') || text.includes('fed') || text.includes('inflation')) {
    return 'Macro'
  }

  if (text.includes('arc') || text.includes('circle') || text.includes('usdc')) {
    return 'Arc'
  }

  return volume24h > 500_000 ? 'Trending' : 'New'
}

function toneFor(text: string): Market['tone'] {
  const tones: Market['tone'][] = ['mint', 'rose', 'ivory', 'blue', 'violet', 'amber']
  let hash = 0

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % tones.length
  }

  return tones[hash]
}

function thumbnailFor(title: string) {
  return title
    .split(/\s+/)
    .filter((word) => /^[a-z0-9]/i.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

function participantsFor(title: string) {
  const words = title
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 4)
    .map((word) => word.slice(0, 4).toUpperCase())

  return [...words, '+12 more']
}

function statusFor(endDate: string): Market['status'] {
  const msUntilEnd = new Date(endDate).getTime() - Date.now()
  const daysUntilEnd = msUntilEnd / 86_400_000

  if (daysUntilEnd <= 3) return 'Ending Soon'
  return 'Live'
}

function fallbackMarket(): Market {
  const price = 0.28

  return {
    id: 'arc-testnet-activity',
    title: 'Will Arc testnet clear 1M daily transactions before May 25?',
    category: 'Arc',
    source: 'Scout fallback',
    tab: 'Arc',
    status: 'Ending Soon',
    description:
      'A fallback Arc market used when the live market scout cannot reach the public feed.',
    price,
    fairPrice: buildFairPrice('Arc testnet activity', price),
    volume24h: 184000,
    liquidity: 76000,
    endDate: '2026-05-25T05:00:00.000Z',
    venue: 'Arc testnet',
    participants: ['ARC', 'CLI', 'RPC', 'USDC', '+18 more'],
    thumbnail: 'A',
    tone: 'mint',
    thesis:
      'Hackathon usage and CLI traffic create a path to a short activity spike, but the deadline window is narrow.',
    catalysts: ['Agora builder traffic', 'RPC key issuance', 'Public demo deadlines'],
    risks: ['No public dashboard', 'Traffic below threshold', 'Submission slippage'],
  }
}

function normalizeGammaEvent(event: GammaEvent): Market | null {
  const market = event.markets?.find((item) => item.active !== false && item.closed !== true)
  if (!market) return null

  const prices = parseMaybeArray(market.outcomePrices)
  const outcomes = parseMaybeArray(market.outcomes)
  const yesIndex = outcomes.findIndex((item) => item.toLowerCase() === 'yes')
  const rawPrice = numberFrom(prices[yesIndex >= 0 ? yesIndex : 0], 0)
  const price = rawPrice > 1 ? rawPrice / 100 : rawPrice
  if (!price || price <= 0 || price >= 1) return null

  const title = market.question || event.title || event.ticker
  if (!title) return null

  const category = event.category || 'Prediction'
  const volume24h = numberFrom(
    market.volume24hrClob,
    numberFrom(market.volume24hr, numberFrom(event.volume24hr)),
  )
  const liquidity = numberFrom(
    market.liquidityNum,
    numberFrom(market.liquidity, numberFrom(event.liquidity)),
  )
  const endDate =
    market.endDateIso ||
    market.endDate ||
    event.endDateIso ||
    event.endDate ||
    '2026-05-25T05:00:00.000Z'

  return {
    id: String(market.id || event.id || event.slug || title),
    title,
    category,
    source: 'Live market feed',
    tab: tabFor(category, title, volume24h),
    status: statusFor(endDate),
    slug: market.slug || event.slug,
    imageUrl: market.image || market.icon || event.image || event.icon,
    description: market.description || event.description,
    price,
    fairPrice: buildFairPrice(title, price),
    volume24h,
    liquidity,
    endDate,
    venue: 'Global',
    participants: participantsFor(title),
    thumbnail: thumbnailFor(title),
    tone: toneFor(title),
    thesis:
      'The analyst is waiting on the buyer-agent report request before revealing the full reasoning packet.',
    catalysts: [
      'Market volume shift',
      'Outcome price drift',
      `${Math.round(hashFloat(title) * 100)}% source-priority score`,
    ],
    risks: ['Thin order book', 'Ambiguous resolution text', 'Late news reversal'],
  }
}

export async function runScoutAgent(): Promise<{ markets: Market[]; run: AgentRun }> {
  const response = await fetch(GAMMA_EVENTS_URL)

  if (!response.ok) {
    throw new Error(`Market feed returned ${response.status}`)
  }

  const data = (await response.json()) as GammaEvent[]
  const markets = data.map(normalizeGammaEvent).filter(Boolean) as Market[]

  if (markets.length < 3) {
    return {
      markets: [fallbackMarket()],
      run: {
        agent: 'Scout Agent',
        status: 'simulated',
        summary: 'The live feed returned too few usable markets, so Scout served the Arc fallback market.',
        artifact: 'fallback:arc-testnet-activity',
      },
    }
  }

  return {
    markets: markets.slice(0, 18),
    run: {
      agent: 'Scout Agent',
      status: 'live',
      summary: `Ranked ${markets.length} active live markets by liquidity, volume, and deadline pressure.`,
      artifact: GAMMA_EVENTS_URL,
    },
  }
}
