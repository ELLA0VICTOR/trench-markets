import type { Market, Signal } from '../types.js'

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

export function buildFairPrice(title: string, price: number) {
  const drift = (hashFloat(title) - 0.5) * 0.26

  return clamp(price + drift, 0.05, 0.95)
}

export function edgeBpsFor(price: number, fairPrice: number) {
  return Math.round((fairPrice - price) * 10_000)
}

export function hashHex(seed: string, bytes = 32) {
  let hash = ''

  for (let index = 0; index < bytes * 2; index += 1) {
    const value = Math.floor(hashFloat(`${seed}:${index}`) * 16)
    hash += value.toString(16)
  }

  return `0x${hash}`
}

export function reportHashFor(market: Market) {
  return hashHex(`report:${market.id}:${market.title}:${market.fairPrice}`, 20)
}

export function proofIdFor(marketId: string, reportHash: string) {
  return `arc-proof-${hashHex(`${marketId}:${reportHash}`, 8).slice(2)}`
}
