import { GatewayClient } from '@circle-fin/x402-batching/client'
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server'
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { runAnalystAgent } from './agents/analystAgent.js'
import { publishArcProof } from './agents/arcProofAgent.js'
import { requestLockedReport, settleX402Challenge } from './agents/buyerAgent.js'
import { runScoutAgent } from './agents/scoutAgent.js'
import { arcWriterConfigured } from './chain/signalRegistryWriter.js'
import { loadLocalEnv } from './lib/env.js'
import { getReport, saveReport } from './storage/reportStore.js'
import type { AgentReport, Market } from './types.js'

loadLocalEnv()

const PORT = Number(process.env.PORT || 8787)
const SELLER_ADDRESS = process.env.CIRCLE_SELLER_ADDRESS
const BUYER_PRIVATE_KEY = process.env.CIRCLE_BUYER_PRIVATE_KEY
const ARC_RPC_URL = process.env.ARC_RPC_URL
const REPORT_PRICE = '$0.04'
const ARC_TESTNET_CAIP2 = 'eip155:5042002'
const FACILITATOR_URL = 'https://gateway-api-testnet.circle.com'

type MarketBody = {
  market?: unknown
}

type ReportBody = {
  marketId?: string
  reportHash?: string
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

function gatewayEnabled() {
  return Boolean(SELLER_ADDRESS)
}

function buyerEnabled() {
  return Boolean(BUYER_PRIVATE_KEY)
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

const app = express()

app.use((request, response, next) => {
  response.header('access-control-allow-origin', '*')
  response.header('access-control-allow-methods', 'GET, POST, OPTIONS')
  response.header('access-control-allow-headers', 'content-type, payment, payment-signature')

  if (request.method === 'OPTIONS') {
    response.sendStatus(204)
    return
  }

  next()
})

app.use(express.json({ limit: '1mb' }))

const gateway = SELLER_ADDRESS
  ? createGatewayMiddleware({
      sellerAddress: SELLER_ADDRESS,
      networks: [ARC_TESTNET_CAIP2],
      facilitatorUrl: FACILITATOR_URL,
      description: 'Trench agent report unlock',
    })
  : null

const unlockReportHandler: RequestHandler = (request: PaidRequest, response) => {
  const result = getExistingReport(request.body as ReportBody)

  if ('error' in result) {
    response.status(404).json({ error: result.error })
    return
  }

  const paidReport = saveReport(
    settleX402Challenge(result.report, {
      transaction: request.payment?.transaction,
      payer: request.payment?.payer,
      network: request.payment?.network,
    }),
  )

  response.json({ report: paidReport, payment: request.payment || null })
}

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
    },
  })
})

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

    const report = saveReport(runAnalystAgent(body.market))
    response.json({ report })
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

    const existing = getReport(body.market.id) || runAnalystAgent(body.market)
    const report = saveReport(requestLockedReport(existing))
    response.json({ report })
  }),
)

if (gateway) {
  app.post('/api/reports/unlock', gateway.require(REPORT_PRICE), unlockReportHandler)
} else {
  app.post('/api/reports/unlock', (_request, response) => {
    response.status(402).json({
      error: 'Circle x402 seller is not configured.',
      requiredEnv: ['CIRCLE_SELLER_ADDRESS', 'CIRCLE_BUYER_PRIVATE_KEY'],
    })
  })
}

app.post(
  '/api/payments/settle',
  asyncRoute(async (request, response) => {
    const result = getExistingReport(request.body as ReportBody)

    if ('error' in result) {
      response.status(404).json({ error: result.error })
      return
    }

    if (gateway && buyerEnabled()) {
      const paid = await payProtectedReport(result.report)
      response.json({ report: saveReport(paid?.data.report || result.report), payment: paid })
      return
    }

    response.json({
      report: saveReport(settleX402Challenge(result.report)),
      payment: {
        mode: 'local-simulation',
        reason: 'Set CIRCLE_SELLER_ADDRESS and CIRCLE_BUYER_PRIVATE_KEY to use Circle Gateway x402.',
      },
    })
  }),
)

app.post(
  '/api/proofs',
  asyncRoute(async (request, response) => {
    const result = getExistingReport(request.body as ReportBody)

    if ('error' in result) {
      response.status(404).json({ error: result.error })
      return
    }

    response.json({ report: saveReport(await publishArcProof(result.report)) })
  }),
)

app.get('/api/reports/:marketId', (request, response) => {
  const report = getReport(request.params.marketId)

  if (!report) {
    response.status(404).json({ error: 'Report not found.' })
    return
  }

  response.json({ report })
})

app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  void next
  const message = error instanceof Error ? error.message : 'Unexpected API error.'
  response.status(500).json({ error: message })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Trench agent API listening on http://127.0.0.1:${PORT}`)
})
