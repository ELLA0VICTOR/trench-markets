import type { AgentReport } from '../types/report'

type ReportResponse = {
  report: AgentReport
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

type GatewayPaymentOption = {
  scheme: string
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  extra?: {
    name?: unknown
    version?: unknown
    verifyingContract?: unknown
  }
}

type PaymentRequiredResponse = {
  x402Version?: number
  resource?: unknown
  accepts?: GatewayPaymentOption[]
}

type UnlockBody = {
  marketId: string
  reportHash: string
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

const ARC_TESTNET_NETWORK = 'eip155:5042002'
const GATEWAY_BATCHING_NAME = 'GatewayWalletBatched'
const GATEWAY_BATCHING_VERSION = '1'
const GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS = 7 * 24 * 60 * 60 + 100

function ensureProvider() {
  if (!window.ethereum) {
    throw new Error('No browser wallet found. Connect a wallet with an Arc Gateway balance.')
  }

  return window.ethereum
}

function assertAddress(value: unknown): `0x${string}` {
  if (typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value as `0x${string}`
  }

  throw new Error('Wallet did not return a valid EVM address.')
}

async function connectBuyerWallet(provider: EthereumProvider) {
  const accounts = await provider.request({ method: 'eth_requestAccounts' })

  if (!Array.isArray(accounts) || !accounts[0]) {
    throw new Error('Wallet connection was cancelled.')
  }

  return assertAddress(accounts[0])
}

function decodePaymentRequired(header: string) {
  return JSON.parse(atob(header)) as PaymentRequiredResponse
}

function encodePaymentSignature(payload: unknown) {
  return btoa(JSON.stringify(payload))
}

function createNonce() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)

  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function selectGatewayOption(paymentRequired: PaymentRequiredResponse) {
  const option = paymentRequired.accepts?.find((candidate) => {
    return (
      candidate.network === ARC_TESTNET_NETWORK &&
      candidate.scheme === 'exact' &&
      candidate.extra?.name === GATEWAY_BATCHING_NAME &&
      candidate.extra?.version === GATEWAY_BATCHING_VERSION &&
      typeof candidate.extra?.verifyingContract === 'string'
    )
  })

  if (!option) {
    throw new Error('This seller did not publish an Arc Gateway x402 payment option.')
  }

  return option
}

async function createPaymentPayload(
  provider: EthereumProvider,
  buyerAddress: `0x${string}`,
  x402Version: number,
  option: GatewayPaymentOption,
) {
  const now = Math.floor(Date.now() / 1_000)
  const validityWindow = Math.max(option.maxTimeoutSeconds, GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS)
  const authorization = {
    from: buyerAddress,
    to: option.payTo,
    value: option.amount,
    validAfter: String(now - 600),
    validBefore: String(now + validityWindow),
    nonce: createNonce(),
  }
  const typedData = {
    domain: {
      name: GATEWAY_BATCHING_NAME,
      version: GATEWAY_BATCHING_VERSION,
      chainId: 5_042_002,
      verifyingContract: option.extra?.verifyingContract,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  }
  const signature = await provider.request({
    method: 'eth_signTypedData_v4',
    params: [buyerAddress, JSON.stringify(typedData)],
  })

  return {
    x402Version,
    payload: {
      authorization,
      signature: assertHex(signature),
    },
  }
}

function assertHex(value: unknown): `0x${string}` {
  if (typeof value === 'string' && /^0x[a-fA-F0-9]+$/.test(value)) {
    return value as `0x${string}`
  }

  throw new Error('Wallet did not return a valid payment signature.')
}

async function parseReportResponse(response: Response) {
  const data = (await response.json()) as ReportResponse

  if (!data.report) {
    throw new Error('Paid response did not include a report.')
  }

  return data.report
}

export async function payReportFromBuyerWallet(marketId: string, reportHash: string) {
  const provider = ensureProvider()
  const buyerAddress = await connectBuyerWallet(provider)
  const body: UnlockBody = { marketId, reportHash }
  const serializedBody = JSON.stringify(body)
  const initialResponse = await fetch('/api/reports/unlock', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: serializedBody,
  })

  if (initialResponse.status !== 402) {
    if (initialResponse.ok) {
      return parseReportResponse(initialResponse)
    }

    throw new Error(`Report unlock failed before payment: ${initialResponse.status}`)
  }

  const paymentRequiredHeader = initialResponse.headers.get('PAYMENT-REQUIRED')

  if (!paymentRequiredHeader) {
    throw new Error('The x402 server did not return a PAYMENT-REQUIRED header.')
  }

  const paymentRequired = decodePaymentRequired(paymentRequiredHeader)
  const gatewayOption = selectGatewayOption(paymentRequired)
  const paymentPayload = await createPaymentPayload(
    provider,
    buyerAddress,
    paymentRequired.x402Version || 2,
    gatewayOption,
  )
  const paidResponse = await fetch('/api/reports/unlock', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Payment-Signature': encodePaymentSignature({
        ...paymentPayload,
        resource: paymentRequired.resource,
        accepted: gatewayOption,
      }),
    },
    body: serializedBody,
  })

  if (!paidResponse.ok) {
    const error = await paidResponse.json().catch(() => null)
    const message =
      error && typeof error === 'object' && 'error' in error && typeof error.error === 'string'
        ? error.error
        : paidResponse.statusText

    throw new Error(`x402 payment failed: ${message}`)
  }

  return parseReportResponse(paidResponse)
}
