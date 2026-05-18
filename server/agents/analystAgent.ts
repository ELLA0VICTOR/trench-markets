import {
  confidenceFor,
  hashFloat,
  hashHex,
  signalFor,
} from '../lib/math.js'
import type { AgentReport, AgentRun, EvidenceBrief, Market, PaymentChallenge } from '../types.js'
import { buildEvidenceBrief, edgeBpsFromEvidence } from './evidenceEngine.js'

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

function pricingForReport(market: Market, edgeBps: number, confidence: number, evidence?: EvidenceBrief) {
  const absoluteEdge = Math.abs(edgeBps)
  const deadlineHours = deadlineHoursFor(market)
  const combinedDepth = Math.max(1, market.volume24h + market.liquidity)
  const edgeScore = clamp(absoluteEdge / 2_200, 0, 1)
  const confidenceScore = clamp(confidence, 0, 1)
  const liquidityScore = clamp(Math.log10(combinedDepth) / 7, 0, 1)
  const evidenceScore = evidence?.forecast.evidenceQuality || 0.28
  const officialScore = evidence?.forecast.officialCoverage || 0
  const contradictionDiscount = evidence ? Math.max(0, 1 - evidence.diagnostics.contradictionScore * 0.22) : 1
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
    (edgeScore * 0.29 +
      confidenceScore * 0.2 +
      liquidityScore * 0.11 +
      urgencyScore * 0.11 +
      evidenceScore * 0.19 +
      officialScore * 0.1 +
      statusBoost) *
      contradictionDiscount,
    0,
    1,
  )
  const price = MIN_REPORT_PRICE + (MAX_REPORT_PRICE - MIN_REPORT_PRICE) * score
  const rationale = [
    `${Math.round(absoluteEdge / 100)} pt agent edge`,
    `${Math.round(confidence * 100)}% confidence`,
    `${Math.max(1, evidence?.items.length || 0)} evidence items`,
    evidence ? `${Math.round(evidence.forecast.officialCoverage * 100)}% official coverage` : 'no official coverage',
    evidence ? `${Math.round(evidence.diagnostics.contradictionScore * 100)}% contradiction risk` : 'unknown contradiction risk',
    combinedDepth >= 500_000 ? 'deep liquidity signal' : 'thin liquidity discount',
    deadlineHours <= 72 ? 'near-deadline urgency' : 'standard deadline window',
  ]

  return {
    amount: formatAmount(clamp(price, MIN_REPORT_PRICE, MAX_REPORT_PRICE)),
    model: 'trench-value-v2' as const,
    minAmount: formatAmount(MIN_REPORT_PRICE),
    maxAmount: formatAmount(MAX_REPORT_PRICE),
    score: Number(score.toFixed(3)),
    rationale,
  }
}

function catalystSet(market: Market, evidence?: EvidenceBrief) {
  const base = market.catalysts.length > 0 ? market.catalysts : ['Price drift', 'Liquidity change']
  const evidenceCatalysts =
    evidence?.items
      .filter((item) => item.stance === 'supports-yes')
      .slice(0, 2)
      .map((item) => `${item.source}: ${item.title}`) || []
  const monitorCatalyst = evidence?.monitoring[0]
    ? `Monitor: ${evidence.monitoring[0].trigger}`
    : undefined
  const deadlineHours = Math.max(
    1,
    Math.round((new Date(market.endDate).getTime() - Date.now()) / 3_600_000),
  )

  return [
    ...evidenceCatalysts,
    ...(monitorCatalyst ? [monitorCatalyst] : []),
    ...base.slice(0, 2),
    `${deadlineHours}h remaining until resolution pressure peaks`,
  ].slice(0, 4)
}

function riskSet(market: Market, evidence?: EvidenceBrief) {
  const base = market.risks.length > 0 ? market.risks : ['Sparse liquidity', 'Resolution ambiguity']
  const evidenceRisks =
    evidence?.items
      .filter((item) => item.stance === 'supports-no')
      .slice(0, 2)
      .map((item) => `${item.source}: ${item.title}`) || []
  const diagnosticRisk = evidence
    ? `${evidence.diagnostics.manipulationRisk} manipulation risk / ${Math.round(evidence.diagnostics.contradictionScore * 100)}% contradiction`
    : undefined
  const liquidityFlag =
    market.liquidity < 100_000
      ? 'Low liquidity can distort executable edge'
      : 'Position sizing must respect order-book depth'

  return [...evidenceRisks, ...(diagnosticRisk ? [diagnosticRisk] : []), ...base.slice(0, 2), liquidityFlag].slice(0, 4)
}

function evidenceSourceSet(market: Market, evidence: EvidenceBrief) {
  const sources = ['Live market metadata', 'Trench probability engine']

  for (const item of evidence.items.slice(0, 5)) {
    sources.push(`${item.source}: ${item.title}`)
  }

  for (const source of evidence.officialSources.filter((item) => item.status === 'hit').slice(0, 3)) {
    sources.push(`${source.label}: official source hit`)
  }

  if (market.slug) {
    sources.push(`Market slug: ${market.slug}`)
  }

  return [...new Set(sources)]
}

function thesisFor(market: Market, edgeBps: number, evidence?: EvidenceBrief) {
  if (evidence) {
    const edgeDirection = edgeBps > 0 ? 'above' : edgeBps < 0 ? 'below' : 'near'

    return `${evidence.summary} V2 places fair value ${edgeDirection} the traded market after checking ${evidence.items.length} source items, ${evidence.officialSources.length} official-source targets, consensus, contradiction, liquidity depth, deadline pressure, and skeptic objections.`
  }

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
  evidence?: EvidenceBrief,
): PaymentChallenge {
  const pricing = pricingForReport(market, edgeBps, confidence, evidence)

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

function evidenceReportHash(market: Market, evidence: EvidenceBrief) {
  const evidenceSeed = evidence.items
    .map((item) => `${item.source}:${item.title}:${item.impact}`)
    .join('|')
  const officialSeed = evidence.officialSources.map((source) => `${source.label}:${source.status}`).join('|')
  const monitoringSeed = evidence.monitoring.map((item) => item.trigger).join('|')

  return hashHex(
    `report:${market.id}:${market.title}:${evidence.version}:${evidence.forecast.fairPrice}:${evidence.forecast.confidence}:${evidence.summary}:${JSON.stringify(evidence.diagnostics)}:${officialSeed}:${monitoringSeed}:${evidenceSeed}`,
    32,
  )
}

export async function runAnalystAgent(market: Market): Promise<AgentReport> {
  const evidence = await buildEvidenceBrief(market)
  const fairPrice = evidence.forecast.fairPrice
  const edgeBps = edgeBpsFromEvidence(market, evidence)
  const confidence = evidence.forecast.confidence || confidenceFor(market.price, fairPrice, market.liquidity)
  const reportHash = evidenceReportHash(market, evidence)
  const runs: AgentRun[] = [
    {
      agent: 'Source Agent',
      status: evidence.officialSources.some((source) => source.status === 'hit') ? 'live' : 'simulated',
      summary: `Targeted ${evidence.officialSources.length} official sources and found ${evidence.officialSources.filter((source) => source.status === 'hit').length} direct hits.`,
      artifact: evidence.officialSources[0]?.label || evidence.plan.category,
    },
    {
      agent: 'Research Agent',
      status: evidence.items.some((item) => item.kind !== 'fallback') ? 'live' : 'simulated',
      summary: `Built a V2 research plan for a ${evidence.plan.eventType} market and scored ${evidence.items.length} evidence items.`,
      artifact: evidence.plan.queries[0],
    },
    {
      agent: 'Forecast Agent',
      status: 'live',
      summary: `${evidence.diagnostics.consensus} consensus, ${evidence.diagnostics.liquidityGrade} liquidity, ${Math.round(evidence.diagnostics.contradictionScore * 100)}% contradiction score.`,
      artifact: `${Math.round(evidence.forecast.fairPrice * 100)}% fair`,
    },
    {
      agent: 'Analyst Agent',
      status: 'live',
      summary: `Forecasted ${Math.round(fairPrice * 100)}% fair value after confidence cap ${Math.round(evidence.forecast.confidenceCap * 100)}%.`,
      artifact: reportHash,
    },
    {
      agent: 'Skeptic Agent',
      status: 'live',
      summary: evidence.skeptic[0],
      artifact: evidence.verdict,
    },
    {
      agent: 'Risk Agent',
      status: 'live',
      summary: `${evidence.recommendation.positionSize}; ${evidence.recommendation.invalidation}`,
      artifact: evidence.recommendation.maxEntry,
    },
  ]

  return {
    marketId: market.id,
    marketTitle: market.title,
    signal: signalFor(market.price, fairPrice),
    fairPrice,
    marketPrice: market.price,
    confidence,
    edgeBps,
    reportHash,
    thesis: thesisFor(market, edgeBps, evidence),
    catalysts: catalystSet(market, evidence),
    risks: riskSet(market, evidence),
    sources: evidenceSourceSet(market, evidence),
    evidence,
    createdAt: new Date().toISOString(),
    locked: true,
    challenge: paymentChallenge(market, reportHash, edgeBps, confidence, evidence),
    runs,
    proof: {
      status: 'not_published',
    },
  }
}
