import type { Market } from '../types/market'
import type { AgentReport } from '../types/report'
import { payReportFromBuyerWallet } from './x402BuyerWallet'

type ReportResponse = {
  report: AgentReport
}

async function parseReportResponse(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    const message =
      error && typeof error === 'object' && 'error' in error && typeof error.error === 'string'
        ? error.error
        : `Agent API returned ${response.status}`

    throw new Error(message)
  }

  const data = (await response.json()) as ReportResponse
  return data.report
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

  return parseReportResponse(response)
}

export function analyzeMarket(market: Market, buyerAddress?: string, signal?: AbortSignal) {
  return postReport('/api/analyze', { market, buyerAddress }, signal)
}

export function requestLockedReport(market: Market, buyerAddress?: string) {
  return postReport('/api/reports/request', { market, buyerAddress })
}

export function settleReportPayment(marketId: string, reportHash: string, buyerAddress?: string) {
  return postReport('/api/payments/sponsored', { marketId, reportHash, buyerAddress })
}

export function settleReportFromBuyerWallet(marketId: string, reportHash: string) {
  return payReportFromBuyerWallet(marketId, reportHash)
}

export function publishReportProof(marketId: string, reportHash: string, buyerAddress?: string) {
  return postReport('/api/proofs', { marketId, reportHash, buyerAddress })
}

export function fetchSavedReport(marketId: string, buyerAddress?: string, signal?: AbortSignal) {
  const params = new URLSearchParams()

  if (buyerAddress) {
    params.set('buyer', buyerAddress)
  }

  const query = params.toString()
  return fetch(`/api/reports/${encodeURIComponent(marketId)}${query ? `?${query}` : ''}`, { signal }).then(
    parseReportResponse,
  )
}
