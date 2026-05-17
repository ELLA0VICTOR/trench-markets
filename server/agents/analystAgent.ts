import {
  confidenceFor,
  edgeBpsFor,
  hashFloat,
  reportHashFor,
  signalFor,
} from '../lib/math.js'
import type { AgentReport, AgentRun, Market, PaymentChallenge } from '../types.js'

const MIN_REPORT_PRICE = 0.04
const MAX_REPORT_PRICE = 2
const RECEIVER_ALIAS = 'analyst.trench'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatAmount(value: number) {
  return value.toFixed(2)
}

function deadlineHoursFor(market: Market) {
  return Math.max(
    1,
    Math.round((new Date(market.endDate).getTime() - Date.now()) / 3_600_000),
  )
}

function receiverForChallenge() {
  return process.env.CIRCLE_SELLER_ADDRESS || RECEIVER_ALIAS
}

function pricingForReport(market: Market, edgeBps: number, confidence: number) {
  const absoluteEdge = Math.abs(edgeBps)
  const deadlineHours = deadlineHoursFor(market)
  const combinedDepth = Math.max(1, market.volume24h + market.liquidity)
  const edgeScore = clamp(absoluteEdge / 2_200, 0, 1)
  const confidenceScore = clamp(confidence, 0, 1)
  const liquidityScore = clamp(Math.log10(combinedDepth) / 7, 0, 1)
  const urgencyScore =
    deadlineHours <= 24
      ? 1
      : deadlineHours <= 72
        ? 0.82
        : deadlineHours <= 168
          ? 0.62
          : deadlineHours <= 720
            ? 0.42
            : 0.2
  const statusBoost = market.status === 'Ending Soon' ? 0.08 : market.status === 'Live' ? 0.03 : -0.06
  const score = clamp(
    edgeScore * 0.38 + confidenceScore * 0.26 + liquidityScore * 0.18 + urgencyScore * 0.18 + statusBoost,
    0,
    1,
  )
  const price = MIN_REPORT_PRICE + (MAX_REPORT_PRICE - MIN_REPORT_PRICE) * score
  const rationale = [
    `${Math.round(absoluteEdge / 100)} pt agent edge`,
    `${Math.round(confidence * 100)}% confidence`,
    combinedDepth >= 500_000 ? 'deep liquidity signal' : 'thin liquidity discount',
    deadlineHours <= 72 ? 'near-deadline urgency' : 'standard deadline window',
  ]

  return {
    amount: formatAmount(clamp(price, MIN_REPORT_PRICE, MAX_REPORT_PRICE)),
    model: 'trench-value-v1' as const,
    minAmount: formatAmount(MIN_REPORT_PRICE),
    maxAmount: formatAmount(MAX_REPORT_PRICE),
    score: Number(score.toFixed(3)),
    rationale,
  }
}

function catalystSet(market: Market) {
  const base = market.catalysts.length > 0 ? market.catalysts : ['Price drift', 'Liquidity change']
  const deadlineHours = Math.max(
    1,
    Math.round((new Date(market.endDate).getTime() - Date.now()) / 3_600_000),
  )

  return [
    ...base.slice(0, 2),
    `${deadlineHours}h remaining until resolution pressure peaks`,
  ]
}

function riskSet(market: Market) {
  const base = market.risks.length > 0 ? market.risks : ['Sparse liquidity', 'Resolution ambiguity']
  const liquidityFlag =
    market.liquidity < 100_000
      ? 'Low liquidity can distort executable edge'
      : 'Position sizing must respect order-book depth'

  return [...base.slice(0, 2), liquidityFlag]
}

function sourceSet(market: Market) {
  const sources = ['Polymarket market metadata', 'Trench probability engine']

  if (market.slug) {
    sources.push(`Polymarket slug: ${market.slug}`)
  }

  if (market.source !== 'Polymarket') {
    sources.push(`${market.source} creator context`)
  }

  return sources
}

function thesisFor(market: Market, edgeBps: number) {
  const edgeDirection = edgeBps > 0 ? 'above' : edgeBps < 0 ? 'below' : 'near'
  const volumeRank = market.volume24h > 500_000 ? 'meaningful' : 'thin but usable'
  const drift = Math.round(hashFloat(`${market.id}:${market.title}:drift`) * 100)

  return `${market.title} is trading ${edgeDirection} Trench fair value with ${volumeRank} recent volume. The analyst weights market price, liquidity, deadline compression, and a ${drift}% drift score before recommending whether a buyer agent should pay for the packet.`
}

function paymentChallenge(
  market: Market,
  reportHash: string,
  edgeBps: number,
  confidence: number,
): PaymentChallenge {
  const pricing = pricingForReport(market, edgeBps, confidence)

  return {
    statusCode: 402,
    scheme: 'x402',
    network: 'Arc testnet',
    asset: 'USDC',
    amount: pricing.amount,
    receiver: receiverForChallenge(),
    reportHash,
    memo: `Trench report unlock for ${market.id}`,
    pricing: {
      model: pricing.model,
      minAmount: pricing.minAmount,
      maxAmount: pricing.maxAmount,
      score: pricing.score,
      rationale: pricing.rationale,
    },
  }
}

export function runAnalystAgent(market: Market): AgentReport {
  const edgeBps = edgeBpsFor(market.price, market.fairPrice)
  const confidence = confidenceFor(market.price, market.fairPrice, market.liquidity)
  const reportHash = reportHashFor(market)
  const runs: AgentRun[] = [
    {
      agent: 'Analyst Agent',
      status: 'live',
      summary: 'Estimated fair probability and generated a locked reasoning packet.',
      artifact: reportHash,
    },
  ]

  return {
    marketId: market.id,
    marketTitle: market.title,
    signal: signalFor(market.price, market.fairPrice),
    fairPrice: market.fairPrice,
    marketPrice: market.price,
    confidence,
    edgeBps,
    reportHash,
    thesis: thesisFor(market, edgeBps),
    catalysts: catalystSet(market),
    risks: riskSet(market),
    sources: sourceSet(market),
    createdAt: new Date().toISOString(),
    locked: true,
    challenge: paymentChallenge(market, reportHash, edgeBps, confidence),
    runs,
    proof: {
      status: 'not_published',
    },
  }
}
