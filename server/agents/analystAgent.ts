import {
  confidenceFor,
  edgeBpsFor,
  hashFloat,
  reportHashFor,
  signalFor,
} from '../lib/math.js'
import type { AgentReport, AgentRun, Market, PaymentChallenge } from '../types.js'

const REPORT_PRICE = '0.04'
const RECEIVER = 'analyst.trench'

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

function paymentChallenge(market: Market, reportHash: string): PaymentChallenge {
  return {
    statusCode: 402,
    scheme: 'x402',
    network: 'Arc testnet',
    asset: 'USDC',
    amount: REPORT_PRICE,
    receiver: RECEIVER,
    reportHash,
    memo: `Trench report unlock for ${market.id}`,
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
    challenge: paymentChallenge(market, reportHash),
    runs,
    proof: {
      status: 'not_published',
    },
  }
}
