import type { Market } from '../types/market'
import type { AgentReport } from '../types/report'
import { payReportFromBuyerWallet } from './x402BuyerWallet'

type ReportResponse = {
  report: AgentReport
}

async function postReport(path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Agent API returned ${response.status}`)
  }

  const data = (await response.json()) as ReportResponse
  return data.report
}

export function analyzeMarket(market: Market, signal?: AbortSignal) {
  return postReport('/api/analyze', { market }, signal)
}

export function requestLockedReport(market: Market) {
  return postReport('/api/reports/request', { market })
}

export function settleReportPayment(marketId: string, reportHash: string) {
  return postReport('/api/payments/sponsored', { marketId, reportHash })
}

export function settleReportFromBuyerWallet(marketId: string, reportHash: string) {
  return payReportFromBuyerWallet(marketId, reportHash)
}

export function publishReportProof(marketId: string, reportHash: string) {
  return postReport('/api/proofs', { marketId, reportHash })
}
