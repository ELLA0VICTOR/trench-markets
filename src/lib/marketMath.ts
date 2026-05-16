import type { Market, Signal } from '../types/market'

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function hashFloat(text: string) {
  let hash = 0

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 997
  }

  return hash / 997
}

export function signalFor(price: number, fairPrice: number): Signal {
  const edge = fairPrice - price

  if (edge > 0.055) return 'BUY YES'
  if (edge < -0.055) return 'BUY NO'
  return 'PASS'
}

export function confidenceFor(price: number, fairPrice: number, liquidity: number) {
  const edge = Math.abs(fairPrice - price)
  const liquidityScore = Math.min(liquidity / 900_000, 1)

  return clamp(0.48 + edge * 1.9 + liquidityScore * 0.16, 0.52, 0.91)
}

export function edgeLabel(price: number, fairPrice: number) {
  const edge = Math.round((fairPrice - price) * 100)

  if (edge > 0) return `+${edge} pts`
  return `${edge} pts`
}

export function buildFairPrice(title: string, price: number) {
  const drift = (hashFloat(title) - 0.5) * 0.26

  return clamp(price + drift, 0.05, 0.95)
}

export function buildCustomMarket(question: string): Market {
  const base = 0.18 + hashFloat(question) * 0.64
  const fairPrice = buildFairPrice(question, base)

  return {
    id: `custom-${Date.now()}`,
    title: question,
    category: 'Custom',
    source: 'Custom market',
    tab: 'Custom',
    status: 'Live',
    description:
      'A custom market created inside Trench and priced by the agent before external liquidity is attached.',
    price: clamp(base, 0.08, 0.92),
    fairPrice,
    volume24h: 84000 + hashFloat(`${question}:volume`) * 420000,
    liquidity: 26000 + hashFloat(`${question}:liquidity`) * 190000,
    endDate: '2026-05-25T05:00:00.000Z',
    venue: 'Custom',
    participants: ['USER', 'AGENT', 'ARC', 'USDC', '+1 more'],
    thumbnail: 'TM',
    tone: 'violet',
    thesis:
      'The custom market is scored from the question text, event horizon, and a neutral liquidity prior until live market depth is attached.',
    catalysts: ['Fresh source links', 'Market creator activity', 'External news confirmation'],
    risks: ['Incomplete data', 'Resolution ambiguity', 'Low-liquidity execution'],
  }
}

export function buildCustomMarketWithImage(question: string, imageUrl?: string): Market {
  return {
    ...buildCustomMarket(question),
    imageUrl,
  }
}

export function txHashFor(market: Market) {
  const base = `${market.id}:${market.title}:${market.fairPrice}`
  let hash = ''

  for (let index = 0; index < 64; index += 1) {
    const value = Math.floor(hashFloat(`${base}:${index}`) * 16)
    hash += value.toString(16)
  }

  return `0x${hash}`
}

export function reportHashFor(market: Market) {
  return txHashFor({ ...market, id: `report-${market.id}` }).slice(0, 42)
}
