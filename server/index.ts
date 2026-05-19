import { GatewayClient } from '@circle-fin/x402-batching/client'
import { BatchFacilitatorClient } from '@circle-fin/x402-batching/server'
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { getAddress, parseUnits } from 'viem'
import { runAnalystAgent } from './agents/analystAgent.js'
import { publishArcProof } from './agents/arcProofAgent.js'
import { requestLockedReport, settleX402Challenge } from './agents/buyerAgent.js'
import { runScoutAgent } from './agents/scoutAgent.js'
import { arcWriterConfigured } from './chain/signalRegistryWriter.js'
import { loadLocalEnv } from './lib/env.js'
import {
  getReport,
  getReportEntitlement,
  grantReportEntitlement,
  hasReportEntitlement,
  hydratePersistentStore,
  normalizeBuyerAddress,
  saveReport,
} from './storage/reportStore.js'
import type { AgentReport, Market } from './types.js'

loadLocalEnv()

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '0.0.0.0'
const SELLER_ADDRESS = process.env.CIRCLE_SELLER_ADDRESS
const BUYER_PRIVATE_KEY = process.env.CIRCLE_BUYER_PRIVATE_KEY
const ARC_RPC_URL = process.env.ARC_RPC_URL
const ARC_TESTNET_CAIP2 = 'eip155:5042002'
const FACILITATOR_URL = 'https://gateway-api-testnet.circle.com'
const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
const ARC_GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9'
const GATEWAY_BATCHING_NAME = 'GatewayWalletBatched'
const GATEWAY_BATCHING_VERSION = '1'
const GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS = 7 * 24 * 60 * 60 + 100
const ARC_GATEWAY_DOMAIN = 26
const REPORT_REFRESH_MINUTES = Number(process.env.REPORT_REFRESH_MINUTES || 15)
const REPORT_REFRESH_MS = Math.max(1, REPORT_REFRESH_MINUTES) * 60_000
const REPORT_PRICE_DRIFT_THRESHOLD = 0.03

type MarketBody = {
  market?: unknown
  buyerAddress?: string
}

type ReportBody = {
  marketId?: string
  reportHash?: string
  buyerAddress?: string
}

type PaidRequest = Request & {
  payment?: {
    verified: boolean
    payer: string
    amount: string
    network: string
    transaction?: string
  }
}

type GatewayPaymentRequirements = {
  scheme: 'exact'
  network: typeof ARC_TESTNET_CAIP2
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  extra: {
    name: typeof GATEWAY_BATCHING_NAME
    version: typeof GATEWAY_BATCHING_VERSION
    verifyingContract: string
  }
}

type GatewayAcceptedRequirements = Partial<GatewayPaymentRequirements> & Record<string, unknown>

type GatewayPaymentResource = {
  url: string
  description: string
  mimeType: string
}

type GatewayPaymentPayload = {
  x402Version: number
  resource?: GatewayPaymentResource
  accepted?: GatewayAcceptedRequirements
  payload: Record<string, unknown>
  extensions?: Record<string, unknown>
}

type GatewayBalanceResponse = {
  balances?: Array<{
    balance?: string
    withdrawing?: string
    withdrawable?: string
  }>
  message?: string
  error?: string
}

function isMarket(value: unknown): value is Market {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<Market>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.price === 'number' &&
    typeof candidate.fairPrice === 'number'
  )
}

function asyncRoute(handler: (request: Request, response: Response) => Promise<void> | void) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response)).catch(next)
  }
}

function getExistingReport(body: ReportBody) {
  if (!body.marketId) {
    return { error: 'Expected a marketId.' as const }
  }

  const report = getReport(body.marketId)

  if (!report || (body.reportHash && body.reportHash !== report.reportHash)) {
    return { error: 'No matching report found.' as const }
  }

  return { report }
}

function reportAgeMs(report: AgentReport) {
  return Date.now() - new Date(report.createdAt).getTime()
}

function reportNeedsRefresh(report: AgentReport, market: Market) {
  const priceDrift = Math.abs(report.marketPrice - market.price)

  return reportAgeMs(report) > REPORT_REFRESH_MS || priceDrift >= REPORT_PRICE_DRIFT_THRESHOLD
}

async function currentReportForMarket(market: Market) {
  const existing = getReport(market.id)

  if (!existing) {
    return saveReport(await runAnalystAgent(market))
  }

  if (!reportNeedsRefresh(existing, market)) {
    return existing
  }

  const next = await runAnalystAgent(market)

  return saveReport({
    ...next,
    supersedesReportHash: existing.reportHash,
  })
}

function reportForClient(report: AgentReport, unlocked = false) {
  if (unlocked) {
    return {
      ...report,
      locked: false,
    }
  }

  return {
    ...report,
    locked: true,
    signal: 'PASS' as const,
    fairPrice: report.marketPrice,
    confidence: 0,
    edgeBps: 0,
    thesis: 'Locked until the buyer satisfies the x402 payment challenge.',
    catalysts: [],
    risks: [],
    sources: [],
    evidence: report.evidence
      ? {
          ...report.evidence,
          plan: {
            event: 'locked',
            deadline: 'locked',
            category: 'locked',
            eventType: 'general',
            entities: [],
            queries: [],
            resolutionNotes: [],
          },
          items: [],
          officialSources: [],
          skeptic: [],
          summary: 'Evidence packet is locked until x402 payment succeeds.',
          forecast: {
            ...report.evidence.forecast,
            evidenceDelta: 0,
            microstructureDelta: 0,
            deadlineDelta: 0,
            fairPrice: report.marketPrice,
            confidence: 0,
            confidenceCap: 0,
            evidenceQuality: 0,
            officialCoverage: 0,
            baseRate: 'locked',
          },
          diagnostics: {
            eventType: 'general',
            consensus: 'thin',
            contradictionScore: 0,
            sourceDiversity: 0,
            liquidityGrade: 'fragile',
            deadlinePressure: 'normal',
            manipulationRisk: 'high',
            confidenceCap: 0,
            officialCoverage: 0,
          },
          recommendation: {
            ...report.evidence.recommendation,
            action: 'PASS' as const,
            positionSize: 'locked',
            maxEntry: 'locked',
            invalidation: 'locked',
          },
          monitoring: [],
        }
      : undefined,
    runs: report.runs.map((run) => ({
      ...run,
      summary:
        run.agent === 'Buyer Agent'
          ? run.summary
          : 'Generated a locked report artifact. Reasoning unlocks after payment.',
      artifact: run.agent === 'Buyer Agent' ? run.artifact : report.reportHash,
    })),
    challenge: {
      ...report.challenge,
      pricing: {
        ...report.challenge.pricing,
        score: 0,
        rationale: [],
      },
    },
  } satisfies AgentReport
}

function gatewayEnabled() {
  return Boolean(SELLER_ADDRESS)
}

function buyerEnabled() {
  return Boolean(BUYER_PRIVATE_KEY)
}

function reportPriceForGateway(report: AgentReport) {
  const amount = Number(report.challenge.amount)

  if (!Number.isFinite(amount) || amount <= 0) {
    return '$0.04'
  }

  return `$${amount.toFixed(2)}`
}

function atomicUsdcFromPrice(price: string) {
  const normalized = price.trim().replace(/^\$/, '')

  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) {
    throw new Error(`Invalid Gateway price: ${price}`)
  }

  const [whole, fraction = ''] = normalized.split('.')
  const atomic = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))

  return atomic.toString()
}

function usdcAtomic(value?: string) {
  return parseUnits(value || '0', 6).toString()
}

async function fetchGatewayBalance(address: string) {
  const depositor = getAddress(address)
  const response = await fetch(`${FACILITATOR_URL}/v1/balances`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      token: 'USDC',
      sources: [{ depositor, domain: ARC_GATEWAY_DOMAIN }],
    }),
  })
  const data = (await response.json().catch(() => ({}))) as GatewayBalanceResponse

  if (!response.ok) {
    if (response.status === 404) {
      return {
        address: depositor,
        domain: ARC_GATEWAY_DOMAIN,
        gatewayAvailable: '0',
        gatewayAvailableAtomic: '0',
        gatewayWithdrawing: '0',
        gatewayWithdrawingAtomic: '0',
        gatewayWithdrawable: '0',
        gatewayWithdrawableAtomic: '0',
      }
    }

    throw new Error(data.message || data.error || response.statusText)
  }

  const balance = data.balances?.[0] || {}

  return {
    address: depositor,
    domain: ARC_GATEWAY_DOMAIN,
    gatewayAvailable: balance.balance || '0',
    gatewayAvailableAtomic: usdcAtomic(balance.balance),
    gatewayWithdrawing: balance.withdrawing || '0',
    gatewayWithdrawingAtomic: usdcAtomic(balance.withdrawing),
    gatewayWithdrawable: balance.withdrawable || '0',
    gatewayWithdrawableAtomic: usdcAtomic(balance.withdrawable),
  }
}

function arcPaymentRequirements(report: AgentReport): GatewayPaymentRequirements {
  if (!SELLER_ADDRESS) {
    throw new Error('Circle x402 seller is not configured.')
  }

  return {
    scheme: 'exact',
    network: ARC_TESTNET_CAIP2,
    asset: ARC_USDC_ADDRESS,
    amount: atomicUsdcFromPrice(reportPriceForGateway(report)),
    payTo: SELLER_ADDRESS,
    maxTimeoutSeconds: GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS,
    extra: {
      name: GATEWAY_BATCHING_NAME,
      version: GATEWAY_BATCHING_VERSION,
      verifyingContract: ARC_GATEWAY_WALLET_ADDRESS,
    },
  }
}

function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase())
}

function acceptedPaymentMatches(
  accepted: GatewayPaymentPayload['accepted'],
  expected: GatewayPaymentRequirements,
) {
  return (
    accepted?.scheme === expected.scheme &&
    accepted.network === expected.network &&
    sameAddress(accepted.asset, expected.asset) &&
    accepted.amount === expected.amount &&
    sameAddress(accepted.payTo, expected.payTo) &&
    accepted.maxTimeoutSeconds === expected.maxTimeoutSeconds &&
    accepted.extra?.name === expected.extra.name &&
    accepted.extra.version === expected.extra.version &&
    sameAddress(accepted.extra.verifyingContract, expected.extra.verifyingContract)
  )
}

function encodePaymentHeader(payload: unknown) {
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

function decodePaymentHeader(header: string) {
  return JSON.parse(Buffer.from(header, 'base64').toString('utf-8')) as GatewayPaymentPayload
}

async function payProtectedReport(report: AgentReport) {
  if (!BUYER_PRIVATE_KEY) return null

  const client = new GatewayClient({
    chain: 'arcTestnet',
    privateKey: BUYER_PRIVATE_KEY as `0x${string}`,
    rpcUrl: ARC_RPC_URL,
  })

  return client.pay<{ report: AgentReport }>(`http://127.0.0.1:${PORT}/api/reports/unlock`, {
    method: 'POST',
    body: {
      marketId: report.marketId,
      reportHash: report.reportHash,
    },
  })
}

function paymentSummary(payment: Awaited<ReturnType<typeof payProtectedReport>>) {
  if (!payment) return null

  return {
    status: payment.status,
    amount: payment.amount.toString(),
    formattedAmount: payment.formattedAmount,
    transaction: payment.transaction,
  }
}

function buyerCanReadReport(buyerAddress: string | undefined, report: AgentReport) {
  return hasReportEntitlement(buyerAddress, report.marketId)
}

const app = express()

app.use((request, response, next) => {
  response.header('access-control-allow-origin', '*')
  response.header('access-control-allow-methods', 'GET, POST, OPTIONS')
  response.header('access-control-allow-headers', 'content-type, payment, payment-signature')
  response.header('access-control-expose-headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE')

  if (request.method === 'OPTIONS') {
    response.sendStatus(204)
    return
  }

  next()
})

app.use(express.json({ limit: '1mb' }))

const facilitator = SELLER_ADDRESS ? new BatchFacilitatorClient({ url: FACILITATOR_URL }) : null

const sponsoredPaymentHandler: RequestHandler = asyncRoute(async (request, response) => {
  const body = request.body as ReportBody
  const result = getExistingReport(body)

  if ('error' in result) {
    response.status(404).json({ error: result.error })
    return
  }

  const buyerAddress = normalizeBuyerAddress(body.buyerAddress) || 'sponsored-demo'

  if (facilitator && buyerEnabled()) {
    const paid = await payProtectedReport(result.report)
    const report = saveReport(paid?.data.report || result.report)

    grantReportEntitlement({
      buyerAddress,
      marketId: report.marketId,
      reportHash: report.reportHash,
      mode: 'sponsored',
      amount: paid?.amount.toString(),
      network: 'arcTestnet',
      txHash: paid?.transaction,
    })

    response.json({
      report: reportForClient(report, true),
      payment: paymentSummary(paid),
    })
    return
  }

  const report = saveReport(settleX402Challenge(result.report))
  grantReportEntitlement({
    buyerAddress,
    marketId: report.marketId,
    reportHash: report.reportHash,
    mode: 'sponsored',
    amount: report.challenge.amount,
    network: report.challenge.network,
  })

  response.json({
    report: reportForClient(report, true),
    payment: {
      mode: 'local-simulation',
      reason: 'Set CIRCLE_SELLER_ADDRESS and CIRCLE_BUYER_PRIVATE_KEY to use Circle Gateway x402.',
    },
  })
})

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'trench-agent-api',
    time: new Date().toISOString(),
    x402: {
      sellerConfigured: gatewayEnabled(),
      buyerConfigured: buyerEnabled(),
      arcWriterConfigured: arcWriterConfigured(),
      facilitatorUrl: FACILITATOR_URL,
      network: 'arcTestnet',
      pricingModel: 'trench-value-v2',
    },
  })
})

app.get(
  '/api/gateway/balances/:address',
  asyncRoute(async (request, response) => {
    const { address } = request.params

    if (typeof address !== 'string') {
      response.status(400).json({ error: 'Expected a wallet address.' })
      return
    }

    response.json(await fetchGatewayBalance(address))
  }),
)

app.get(
  '/api/markets',
  asyncRoute(async (_request, response) => {
    response.json(await runScoutAgent())
  }),
)

app.post(
  '/api/analyze',
  asyncRoute(async (request, response) => {
    const body = request.body as MarketBody

    if (!isMarket(body.market)) {
      response.status(400).json({ error: 'Expected a market payload.' })
      return
    }

    const buyerAddress = normalizeBuyerAddress(body.buyerAddress)
    const report = await currentReportForMarket(body.market)

    response.json({ report: reportForClient(report, buyerCanReadReport(buyerAddress, report)) })
  }),
)

app.post(
  '/api/reports/request',
  asyncRoute(async (request, response) => {
    const body = request.body as MarketBody

    if (!isMarket(body.market)) {
      response.status(400).json({ error: 'Expected a market payload.' })
      return
    }

    const buyerAddress = normalizeBuyerAddress(body.buyerAddress)
    const existing = await currentReportForMarket(body.market)
    const unlocked = buyerCanReadReport(buyerAddress, existing)

    if (unlocked) {
      response.json({
        report: reportForClient(existing, true),
        entitlement: getReportEntitlement(buyerAddress, existing.marketId),
      })
      return
    }

    const report = requestLockedReport(existing)
    response.json({ report: reportForClient(report, false) })
  }),
)

if (facilitator) {
  app.post(
    '/api/reports/unlock',
    asyncRoute(async (request, response) => {
      const paidRequest = request as PaidRequest
      const body = request.body as ReportBody
      const result = getExistingReport(body)

      if ('error' in result) {
        response.status(404).json({ error: result.error })
        return
      }

      const buyerAddress = normalizeBuyerAddress(body.buyerAddress)

      if (buyerCanReadReport(buyerAddress, result.report)) {
        response.json({
          report: reportForClient(result.report, true),
          entitlement: getReportEntitlement(buyerAddress, result.report.marketId),
        })
        return
      }

      const requirements = arcPaymentRequirements(result.report)
      const paymentHeader = request.headers['payment-signature']

      if (typeof paymentHeader !== 'string') {
        response
          .status(402)
          .setHeader(
            'PAYMENT-REQUIRED',
            encodePaymentHeader({
              x402Version: 2,
              resource: {
                url: request.url || '/api/reports/unlock',
                description: 'Trench agent report unlock',
                mimeType: 'application/json',
              },
              accepts: [requirements],
            }),
          )
          .json({})
        return
      }

      const paymentPayload = decodePaymentHeader(paymentHeader)

      if (!paymentPayload.payload || !acceptedPaymentMatches(paymentPayload.accepted, requirements)) {
        response.status(400).json({ error: 'Payment requirements do not match the report quote.' })
        return
      }

      const verifyResult = await facilitator.verify(paymentPayload, requirements)

      if (!verifyResult.isValid) {
        response.status(402).json({
          error: 'Payment verification failed',
          reason: verifyResult.invalidReason,
        })
        return
      }

      const settleResult = await facilitator.settle(paymentPayload, requirements)

      if (!settleResult.success) {
        response.status(402).json({
          error: 'Payment settlement failed',
          reason: settleResult.errorReason,
        })
        return
      }

      paidRequest.payment = {
        verified: true,
        payer: settleResult.payer ?? verifyResult.payer ?? '',
        amount: requirements.amount,
        network: requirements.network,
        transaction: settleResult.transaction,
      }

      response.setHeader(
        'PAYMENT-RESPONSE',
        encodePaymentHeader({
          success: true,
          transaction: settleResult.transaction,
          network: requirements.network,
          payer: settleResult.payer ?? verifyResult.payer ?? '',
        }),
      )

      const paidReport = saveReport(
        settleX402Challenge(result.report, {
          transaction: paidRequest.payment.transaction,
          payer: paidRequest.payment.payer,
          network: paidRequest.payment.network,
        }),
      )
      const payer = normalizeBuyerAddress(paidRequest.payment.payer || buyerAddress)

      grantReportEntitlement({
        buyerAddress: payer,
        marketId: paidReport.marketId,
        reportHash: paidReport.reportHash,
        mode: 'gateway',
        amount: paidRequest.payment.amount,
        network: paidRequest.payment.network,
        txHash: paidRequest.payment.transaction,
      })

      response.json({ report: reportForClient(paidReport, true), payment: paidRequest.payment })
    }),
  )
} else {
  app.post('/api/reports/unlock', (_request, response) => {
    response.status(402).json({
      error: 'Circle x402 seller is not configured.',
      requiredEnv: ['CIRCLE_SELLER_ADDRESS', 'CIRCLE_BUYER_PRIVATE_KEY'],
    })
  })
}

app.post('/api/payments/sponsored', sponsoredPaymentHandler)
app.post('/api/payments/settle', sponsoredPaymentHandler)

app.post(
  '/api/proofs',
  asyncRoute(async (request, response) => {
    const body = request.body as ReportBody
    const result = getExistingReport(body)

    if ('error' in result) {
      response.status(404).json({ error: result.error })
      return
    }

    const buyerAddress = normalizeBuyerAddress(body.buyerAddress)
    const unlocked = !result.report.locked || buyerCanReadReport(buyerAddress, result.report)

    if (!unlocked) {
      response.status(402).json({ error: 'Unlock the report before publishing an Arc proof.' })
      return
    }

    response.json({ report: reportForClient(saveReport(await publishArcProof({ ...result.report, locked: false })), true) })
  }),
)

app.get('/api/reports/:marketId', (request, response) => {
  const report = getReport(request.params.marketId)

  if (!report) {
    response.status(404).json({ error: 'Report not found.' })
    return
  }

  const buyerAddress = normalizeBuyerAddress(typeof request.query.buyer === 'string' ? request.query.buyer : undefined)
  const unlocked = buyerCanReadReport(buyerAddress, report)

  response.json({
    report: reportForClient(report, unlocked),
    entitlement: unlocked ? getReportEntitlement(buyerAddress, report.marketId) : undefined,
  })
})

app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  void next
  const message = error instanceof Error ? error.message : 'Unexpected API error.'
  response.status(500).json({ error: message })
})

hydratePersistentStore()
  .catch((error) => {
    console.warn(error instanceof Error ? error.message : 'Supabase hydration failed.')
  })
  .finally(() => {
    app.listen(PORT, HOST, () => {
      console.log(`Trench agent API listening on http://${HOST}:${PORT}`)
    })
  })
