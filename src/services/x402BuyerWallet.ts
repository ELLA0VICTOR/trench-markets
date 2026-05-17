import type { AgentReport } from '../types/report'
import { getAddress, recoverTypedDataAddress } from 'viem'

type ReportResponse = {
  report: AgentReport
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  isCoinbaseWallet?: boolean
  isMetaMask?: boolean
  isOkxWallet?: boolean
  isRabby?: boolean
  providers?: EthereumProvider[]
}

type WalletProviderInfo = {
  uuid: string
  name: string
  icon?: string
  rdns?: string
}

type WalletProviderDetail = {
  info: WalletProviderInfo
  provider: EthereumProvider
}

export type BrowserWalletSession = {
  address: `0x${string}`
  walletName: string
  walletUuid?: string
  walletRdns?: string
  verificationSignature?: `0x${string}`
  verifiedAt?: number
  connectedAt: number
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

  interface WindowEventMap {
    'eip6963:announceProvider': CustomEvent<WalletProviderDetail>
    'eip6963:requestProvider': Event
  }
}

const ARC_TESTNET_NETWORK = 'eip155:5042002'
const ARC_TESTNET_CHAIN_ID_HEX = '0x4cef52'
const GATEWAY_BATCHING_NAME = 'GatewayWalletBatched'
const GATEWAY_BATCHING_VERSION = '1'
const GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS = 7 * 24 * 60 * 60 + 100
const WALLET_SESSION_KEY = 'trench.walletSession.v1'
const WALLET_VERIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1_000

let activeWallet: WalletProviderDetail | undefined

function walletStorage() {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function walletLabel(provider: EthereumProvider, index: number) {
  if (provider.isMetaMask) return 'MetaMask'
  if (provider.isRabby) return 'Rabby'
  if (provider.isCoinbaseWallet) return 'Coinbase Wallet'
  if (provider.isOkxWallet) return 'OKX Wallet'

  return `Browser wallet ${index + 1}`
}

function walletRank(wallet: WalletProviderDetail) {
  const label = `${wallet.info.name} ${wallet.info.rdns || ''}`.toLowerCase()

  if (label.includes('metamask')) return 0
  if (label.includes('rabby')) return 1
  if (label.includes('coinbase')) return 2
  if (label.includes('okx')) return 3

  return 10
}

function normalizeAddress(address: `0x${string}`) {
  return address.toLowerCase()
}

function maybeAddress(value: unknown) {
  try {
    return assertAddress(value)
  } catch {
    return undefined
  }
}

function maybeHex(value: unknown) {
  try {
    return assertHex(value)
  } catch {
    return undefined
  }
}

function walletMatchesSession(wallet: WalletProviderDetail, session: BrowserWalletSession) {
  return (
    wallet.info.uuid === session.walletUuid ||
    (Boolean(wallet.info.rdns) && wallet.info.rdns === session.walletRdns) ||
    wallet.info.name === session.walletName
  )
}

function selectWalletForSession(wallets: WalletProviderDetail[], session?: BrowserWalletSession) {
  if (!session) {
    return undefined
  }

  return wallets.find((wallet) => walletMatchesSession(wallet, session))
}

function isReusableVerification(session: BrowserWalletSession, wallet: WalletProviderDetail, address: `0x${string}`) {
  if (!session.verificationSignature || !session.verifiedAt) {
    return false
  }

  return (
    normalizeAddress(session.address) === normalizeAddress(address) &&
    walletMatchesSession(wallet, session) &&
    Date.now() - session.verifiedAt < WALLET_VERIFICATION_TTL_MS
  )
}

function readStoredWalletSession() {
  const storage = walletStorage()
  const raw = storage?.getItem(WALLET_SESSION_KEY)

  if (!raw) {
    return undefined
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BrowserWalletSession>
    const address = maybeAddress(parsed.address)

    if (!address || typeof parsed.walletName !== 'string' || typeof parsed.connectedAt !== 'number') {
      storage?.removeItem(WALLET_SESSION_KEY)
      return undefined
    }

    return {
      address,
      walletName: parsed.walletName,
      walletUuid: typeof parsed.walletUuid === 'string' ? parsed.walletUuid : undefined,
      walletRdns: typeof parsed.walletRdns === 'string' ? parsed.walletRdns : undefined,
      verificationSignature: maybeHex(parsed.verificationSignature),
      verifiedAt: typeof parsed.verifiedAt === 'number' ? parsed.verifiedAt : undefined,
      connectedAt: parsed.connectedAt,
    } satisfies BrowserWalletSession
  } catch {
    storage?.removeItem(WALLET_SESSION_KEY)
    return undefined
  }
}

function writeWalletSession(
  wallet: WalletProviderDetail,
  address: `0x${string}`,
  verificationSignature?: `0x${string}`,
) {
  const previous = readStoredWalletSession()
  const session = {
    address,
    walletName: wallet.info.name,
    walletUuid: wallet.info.uuid,
    walletRdns: wallet.info.rdns,
    verificationSignature,
    verifiedAt: verificationSignature ? Date.now() : previous?.verifiedAt,
    connectedAt: previous?.connectedAt || Date.now(),
  } satisfies BrowserWalletSession

  walletStorage()?.setItem(WALLET_SESSION_KEY, JSON.stringify(session))

  return session
}

function clearStoredWalletSession() {
  walletStorage()?.removeItem(WALLET_SESSION_KEY)
}

export function restoreBrowserWalletSession() {
  return readStoredWalletSession()
}

function getLegacyEthereum() {
  try {
    const ethereum = window.ethereum

    if (ethereum?.request) {
      return ethereum
    }
  } catch {
    return undefined
  }

  return undefined
}

function legacyWallets() {
  const ethereum = getLegacyEthereum()

  if (!ethereum) {
    return []
  }

  const providers = Array.isArray(ethereum.providers) ? ethereum.providers : [ethereum]

  return providers
    .filter((provider): provider is EthereumProvider => Boolean(provider?.request))
    .map((provider, index) => ({
      info: {
        uuid: `legacy-${index}`,
        name: walletLabel(provider, index),
      },
      provider,
    }))
}

async function discoverWallets() {
  const announced = new Map<string, WalletProviderDetail>()
  const seenProviders = new Set<EthereumProvider>()
  const onAnnouncement = (event: CustomEvent<WalletProviderDetail>) => {
    const detail = event.detail

    if (!detail?.provider?.request || seenProviders.has(detail.provider)) {
      return
    }

    seenProviders.add(detail.provider)
    announced.set(detail.info.uuid, detail)
  }

  window.addEventListener('eip6963:announceProvider', onAnnouncement)
  window.dispatchEvent(new Event('eip6963:requestProvider'))

  await new Promise((resolve) => {
    window.setTimeout(resolve, 450)
  })

  window.removeEventListener('eip6963:announceProvider', onAnnouncement)

  for (const wallet of legacyWallets()) {
    if (!seenProviders.has(wallet.provider)) {
      announced.set(wallet.info.uuid, wallet)
    }
  }

  return [...announced.values()].sort((left, right) => walletRank(left) - walletRank(right))
}

async function ensureWallet() {
  if (activeWallet) {
    return activeWallet
  }

  const wallets = await discoverWallets()

  if (wallets.length === 0) {
    throw new Error('No browser wallet found. Connect a wallet with an Arc Gateway balance.')
  }

  activeWallet = selectWalletForSession(wallets, readStoredWalletSession()) || wallets[0]
  return activeWallet
}

export function resetBrowserWallet() {
  activeWallet = undefined
  clearStoredWalletSession()
}

function assertAddress(value: unknown): `0x${string}` {
  if (typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value as `0x${string}`
  }

  throw new Error('Wallet did not return a valid EVM address.')
}

function checksumAddress(value: unknown, label: string) {
  const address = assertAddress(value)

  try {
    return getAddress(address)
  } catch {
    throw new Error(`${label} is not a valid EVM address.`)
  }
}

function rpcErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    return Number((error as { code: unknown }).code)
  }

  return undefined
}

function rpcErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message

    if (typeof message === 'string') {
      return message
    }
  }

  return 'Wallet request failed.'
}

function isUnknownChainError(error: unknown) {
  const message = rpcErrorMessage(error).toLowerCase()

  return (
    rpcErrorCode(error) === 4902 ||
    message.includes('unrecognized chain') ||
    message.includes('wallet_addethereumchain')
  )
}

async function currentChainId(provider: EthereumProvider) {
  const chainId = await provider.request({ method: 'eth_chainId' })

  return typeof chainId === 'string' ? chainId.toLowerCase() : undefined
}

async function addArcTestnet(provider: EthereumProvider) {
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: ARC_TESTNET_CHAIN_ID_HEX,
        chainName: 'Arc Testnet',
        nativeCurrency: {
          name: 'USDC',
          symbol: 'USDC',
          decimals: 18,
        },
        rpcUrls: ['https://rpc.testnet.arc.network'],
        blockExplorerUrls: ['https://testnet.arcscan.app'],
      },
    ],
  })
}

async function ensureArcTestnet(provider: EthereumProvider) {
  const chainId = await currentChainId(provider).catch(() => undefined)

  if (chainId === ARC_TESTNET_CHAIN_ID_HEX) {
    return
  }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_TESTNET_CHAIN_ID_HEX }],
    })
  } catch (error) {
    if (!isUnknownChainError(error)) {
      throw new Error(`Switch to Arc Testnet failed: ${rpcErrorMessage(error)}`, { cause: error })
    }

    await addArcTestnet(provider)
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_TESTNET_CHAIN_ID_HEX }],
    })
  }

  const nextChainId = await currentChainId(provider).catch(() => undefined)

  if (nextChainId !== ARC_TESTNET_CHAIN_ID_HEX) {
    throw new Error('Switch your wallet to Arc Testnet before signing the x402 payment.')
  }
}

async function connectBuyerWallet(provider: EthereumProvider) {
  const accounts = await provider.request({ method: 'eth_requestAccounts' })

  if (!Array.isArray(accounts) || !accounts[0]) {
    throw new Error('Wallet connection was cancelled.')
  }

  return assertAddress(accounts[0])
}

function verificationMessage(address: string) {
  const nonce = createNonce().slice(2, 18)

  return [
    'Trench wallet verification',
    '',
    'This signature proves wallet ownership for this local Trench session.',
    'It does not spend funds or authorize payments.',
    '',
    `Address: ${address}`,
    `Origin: ${window.location.origin}`,
    `Nonce: ${nonce}`,
  ].join('\n')
}

async function signWalletVerification(provider: EthereumProvider, address: `0x${string}`) {
  const signature = await provider.request({
    method: 'personal_sign',
    params: [verificationMessage(address), address],
  })

  return assertHex(signature)
}

export async function connectBrowserWallet() {
  const wallet = await ensureWallet()
  const address = await connectBuyerWallet(wallet.provider)
  const existingSession = readStoredWalletSession()
  const canReuseVerification = existingSession
    ? isReusableVerification(existingSession, wallet, address)
    : false
  const verificationSignature = canReuseVerification
    ? existingSession?.verificationSignature
    : await signWalletVerification(wallet.provider, address)

  return writeWalletSession(wallet, address, verificationSignature)
}

export async function switchBrowserWallet() {
  resetBrowserWallet()
  return connectBrowserWallet()
}

export async function validateStoredBrowserWalletSession() {
  const session = readStoredWalletSession()

  if (!session) {
    return undefined
  }

  const wallets = await discoverWallets()
  const wallet = selectWalletForSession(wallets, session) || wallets[0]

  if (!wallet) {
    return session
  }

  activeWallet = wallet

  const accounts = await wallet.provider.request({ method: 'eth_accounts' }).catch(() => [])

  if (!Array.isArray(accounts) || accounts.length === 0) {
    resetBrowserWallet()
    return undefined
  }

  const address = accounts.map(maybeAddress).find(Boolean)

  if (!address) {
    resetBrowserWallet()
    return undefined
  }

  if (normalizeAddress(address) !== normalizeAddress(session.address)) {
    return writeWalletSession(wallet, address)
  }

  return writeWalletSession(wallet, session.address, session.verificationSignature)
}

export async function watchBrowserWalletSession(onChange: (session?: BrowserWalletSession) => void) {
  const wallets = await discoverWallets()
  const cleanup: Array<() => void> = []

  for (const wallet of wallets) {
    const provider = wallet.provider as EthereumProvider & {
      on?: (event: string, handler: (value: unknown) => void) => void
      removeListener?: (event: string, handler: (value: unknown) => void) => void
    }

    if (!provider.on || !provider.removeListener) {
      continue
    }

    const onAccountsChanged = (value: unknown) => {
      if (!Array.isArray(value) || value.length === 0) {
        resetBrowserWallet()
        onChange(undefined)
        return
      }

      const address = value.map(maybeAddress).find(Boolean)

      if (!address) {
        resetBrowserWallet()
        onChange(undefined)
        return
      }

      activeWallet = wallet
      onChange(writeWalletSession(wallet, address))
    }

    provider.on('accountsChanged', onAccountsChanged)
    cleanup.push(() => provider.removeListener?.('accountsChanged', onAccountsChanged))
  }

  return () => {
    cleanup.forEach((release) => release())
  }
}

function decodePaymentRequired(header: string) {
  return JSON.parse(atob(header)) as PaymentRequiredResponse
}

function encodePaymentSignature(payload: unknown) {
  return btoa(JSON.stringify(payload))
}

function stringifyTypedDataForWallet(payload: unknown) {
  return JSON.stringify(payload, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
}

function createNonce(): `0x${string}` {
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
  const verifyingContract = checksumAddress(option.extra?.verifyingContract, 'Gateway verifying contract')
  const now = Math.floor(Date.now() / 1_000)
  const validityWindow = Math.max(option.maxTimeoutSeconds, GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS)
  const authorization = {
    from: checksumAddress(buyerAddress, 'Buyer wallet'),
    to: checksumAddress(option.payTo, 'Seller wallet'),
    value: option.amount,
    validAfter: String(now - 600),
    validBefore: String(now + validityWindow),
    nonce: createNonce(),
  }
  const typedData = {
    domain: {
      name: GATEWAY_BATCHING_NAME,
      version: GATEWAY_BATCHING_VERSION,
      chainId: Number(ARC_TESTNET_NETWORK.split(':')[1]),
      verifyingContract,
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
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  } as const
  const signature = await provider.request({
    method: 'eth_signTypedData_v4',
    params: [authorization.from, stringifyTypedDataForWallet(typedData)],
  })
  const paymentSignature = assertHex(signature)
  const recoveredAddress = await recoverTypedDataAddress({
    ...typedData,
    signature: paymentSignature,
  })

  if (normalizeAddress(recoveredAddress) !== normalizeAddress(authorization.from)) {
    throw new Error(
      `Wallet signed from ${recoveredAddress.slice(0, 6)}...${recoveredAddress.slice(-4)}, expected ${authorization.from.slice(0, 6)}...${authorization.from.slice(-4)}. Change wallet or disable conflicting wallet extensions.`,
    )
  }

  return {
    x402Version,
    payload: {
      authorization,
      signature: paymentSignature,
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
  const wallet = await ensureWallet()
  const provider = wallet.provider
  const buyerAddress = await connectBuyerWallet(provider)
  const existingSession = readStoredWalletSession()
  writeWalletSession(
    wallet,
    buyerAddress,
    existingSession && normalizeAddress(existingSession.address) === normalizeAddress(buyerAddress)
      ? existingSession.verificationSignature
      : undefined,
  )
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
  await ensureArcTestnet(provider)
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
    const message = paymentErrorMessage(error, paidResponse.statusText)

    throw new Error(`x402 payment failed: ${message}`)
  }

  return parseReportResponse(paidResponse)
}

function paymentErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') {
    return fallback
  }

  const response = error as { error?: unknown; reason?: unknown; message?: unknown }
  const message =
    typeof response.error === 'string'
      ? response.error
      : typeof response.message === 'string'
        ? response.message
        : fallback
  const reason = typeof response.reason === 'string' ? response.reason : undefined

  return reason ? `${message}: ${reason}` : message
}
