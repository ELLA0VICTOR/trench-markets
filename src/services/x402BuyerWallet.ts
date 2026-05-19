import type { AgentReport } from '../types/report'
import { decodeFunctionResult, encodeFunctionData, formatUnits, getAddress, parseAbi, recoverTypedDataAddress } from 'viem'
import { apiFetch } from '../lib/api'

type ReportResponse = {
  report: AgentReport
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  isCoinbaseWallet?: boolean
  isMetaMask?: boolean
  isOkxWallet?: boolean
  isPhantom?: boolean
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

export type BrowserWalletOption = WalletProviderInfo

export type BrowserWalletSession = {
  address: `0x${string}`
  walletName: string
  walletUuid?: string
  walletRdns?: string
  verificationSignature?: `0x${string}`
  verifiedAt?: number
  connectedAt: number
}

export type BuyerWalletPaymentPhase =
  | 'requesting-challenge'
  | 'checking-gateway'
  | 'checking-wallet'
  | 'approving-gateway'
  | 'depositing-gateway'
  | 'waiting-gateway'
  | 'signing-payment'
  | 'settling-payment'

export type BuyerWalletPaymentStatus = {
  phase: BuyerWalletPaymentPhase
  message: string
}

type PayReportOptions = {
  onStatus?: (status: BuyerWalletPaymentStatus) => void
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
  buyerAddress?: string
}

type GatewayBalanceResult = {
  address: `0x${string}`
  gatewayAvailable: string
  gatewayAvailableAtomic: string
}

function isGatewayBalanceResult(value: unknown): value is GatewayBalanceResult {
  if (!value || typeof value !== 'object') {
    return false
  }

  return (
    'gatewayAvailableAtomic' in value &&
    typeof (value as GatewayBalanceResult).gatewayAvailableAtomic === 'string' &&
    typeof (value as GatewayBalanceResult).gatewayAvailable === 'string'
  )
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
const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
const ARC_GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9'
const GATEWAY_BATCHING_NAME = 'GatewayWalletBatched'
const GATEWAY_BATCHING_VERSION = '1'
const GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS = 7 * 24 * 60 * 60 + 100
const WALLET_SESSION_KEY = 'trench.walletSession.v1'
const WALLET_VERIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1_000
const GATEWAY_BALANCE_POLL_ATTEMPTS = 18
const GATEWAY_BALANCE_POLL_DELAY_MS = 2_000
const TRANSACTION_RECEIPT_ATTEMPTS = 40
const TRANSACTION_RECEIPT_DELAY_MS = 1_500

const erc20Abi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

const gatewayWalletAbi = parseAbi(['function deposit(address token, uint256 value)'])

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
  if (provider.isPhantom) return 'Phantom'

  return `Browser wallet ${index + 1}`
}

function walletKind(wallet: WalletProviderDetail) {
  const label = `${wallet.info.name} ${wallet.info.rdns || ''}`.toLowerCase()

  if (label.includes('metamask')) return 'metamask'
  if (label.includes('rabby')) return 'rabby'
  if (label.includes('coinbase')) return 'coinbase'
  if (label.includes('okx')) return 'okx'
  if (label.includes('phantom')) return 'phantom'
  if (wallet.provider.isMetaMask) return 'metamask'
  if (wallet.provider.isRabby) return 'rabby'
  if (wallet.provider.isCoinbaseWallet) return 'coinbase'
  if (wallet.provider.isOkxWallet) return 'okx'
  if (wallet.provider.isPhantom) return 'phantom'

  return wallet.info.rdns?.toLowerCase() || wallet.info.name.toLowerCase()
}

function isLegacyWallet(wallet: WalletProviderDetail) {
  return wallet.info.uuid.startsWith('legacy-')
}

function shouldReplaceWallet(current: WalletProviderDetail, next: WalletProviderDetail) {
  if (isLegacyWallet(current) && !isLegacyWallet(next)) return true
  if (!current.info.icon && Boolean(next.info.icon)) return true

  return false
}

function uniqueWallets(wallets: WalletProviderDetail[]) {
  const byKind = new Map<string, WalletProviderDetail>()

  for (const wallet of wallets) {
    const key = walletKind(wallet)
    const current = byKind.get(key)

    if (!current || shouldReplaceWallet(current, wallet)) {
      byKind.set(key, wallet)
    }
  }

  return [...byKind.values()]
}

function walletRank(wallet: WalletProviderDetail) {
  const label = walletKind(wallet)

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

function selectWalletByUuid(wallets: WalletProviderDetail[], walletUuid?: string) {
  if (!walletUuid) {
    return undefined
  }

  return wallets.find((wallet) => wallet.info.uuid === walletUuid)
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
  const onAnnouncement = (event: CustomEvent<WalletProviderDetail>) => {
    const detail = event.detail

    if (!detail?.provider?.request) {
      return
    }

    announced.set(detail.info.uuid || detail.info.rdns || detail.info.name, detail)
  }

  window.addEventListener('eip6963:announceProvider', onAnnouncement)
  window.dispatchEvent(new Event('eip6963:requestProvider'))

  await new Promise((resolve) => {
    window.setTimeout(resolve, 900)
  })

  window.removeEventListener('eip6963:announceProvider', onAnnouncement)

  for (const wallet of legacyWallets()) {
    announced.set(wallet.info.uuid, wallet)
  }

  return uniqueWallets([...announced.values()]).sort((left, right) => walletRank(left) - walletRank(right))
}

export async function listBrowserWallets(): Promise<BrowserWalletOption[]> {
  return (await discoverWallets()).map((wallet) => wallet.info)
}

async function ensureWallet(walletUuid?: string) {
  if (activeWallet && walletUuid && activeWallet.info.uuid === walletUuid) {
    return activeWallet
  }

  const wallets = await discoverWallets()
  const session = readStoredWalletSession()

  if (wallets.length === 0) {
    throw new Error('No browser wallet found. Connect a wallet with an Arc Gateway balance.')
  }

  activeWallet =
    selectWalletByUuid(wallets, walletUuid) ||
    selectWalletForSession(wallets, session) ||
    (activeWallet ? selectWalletByUuid(wallets, activeWallet.info.uuid) : undefined) ||
    wallets[0]
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

async function activeWalletAddress(provider: EthereumProvider) {
  const accounts = await provider.request({ method: 'eth_accounts' }).catch(() => [])

  if (!Array.isArray(accounts) || !accounts[0]) {
    return undefined
  }

  return accounts.map(maybeAddress).find(Boolean)
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

export async function connectBrowserWallet(walletUuid?: string) {
  const wallet = await ensureWallet(walletUuid)
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
      const session = readStoredWalletSession()
      const isActiveProvider = activeWallet?.info.uuid === wallet.info.uuid
      const isSessionProvider = session ? walletMatchesSession(wallet, session) : false

      if (!isActiveProvider && !isSessionProvider) {
        return
      }

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

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatAtomicUsdc(value: string) {
  const atomic = BigInt(value)
  const whole = atomic / 1_000_000n
  const fraction = (atomic % 1_000_000n).toString().padStart(6, '0').replace(/0+$/g, '')

  return fraction ? `${whole}.${fraction}` : whole.toString()
}

function emitPaymentStatus(options: PayReportOptions | undefined, phase: BuyerWalletPaymentPhase, message: string) {
  options?.onStatus?.({ phase, message })
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function contractCall(provider: EthereumProvider, to: `0x${string}`, data: `0x${string}`) {
  return provider.request({
    method: 'eth_call',
    params: [
      {
        to,
        data,
      },
      'latest',
    ],
  })
}

async function readUsdcBalance(provider: EthereumProvider, token: `0x${string}`, address: `0x${string}`) {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  })
  const result = assertHex(await contractCall(provider, token, data))
  const decoded = decodeFunctionResult({
    abi: erc20Abi,
    functionName: 'balanceOf',
    data: result,
  })

  if (typeof decoded !== 'bigint') {
    throw new Error('USDC balance call returned an unexpected value.')
  }

  return decoded
}

async function readUsdcAllowance(
  provider: EthereumProvider,
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
) {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  })
  const result = assertHex(await contractCall(provider, token, data))
  const decoded = decodeFunctionResult({
    abi: erc20Abi,
    functionName: 'allowance',
    data: result,
  })

  if (typeof decoded !== 'bigint') {
    throw new Error('USDC allowance call returned an unexpected value.')
  }

  return decoded
}

async function sendContractTransaction(
  provider: EthereumProvider,
  from: `0x${string}`,
  to: `0x${string}`,
  data: `0x${string}`,
  label: string,
  gas?: string,
) {
  try {
    return assertHex(
      await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from,
            to,
            data,
            value: '0x0',
            ...(gas ? { gas } : {}),
          },
        ],
      }),
    )
  } catch (error) {
    if (rpcErrorCode(error) === 4001) {
      throw new Error(`${label} was rejected in the wallet. Confirm it to continue the report payment.`, {
        cause: error,
      })
    }

    throw new Error(`${label} transaction failed: ${rpcErrorMessage(error)}`, { cause: error })
  }
}

async function waitForTransactionReceipt(provider: EthereumProvider, hash: `0x${string}`, label: string) {
  for (let attempt = 0; attempt < TRANSACTION_RECEIPT_ATTEMPTS; attempt += 1) {
    const receipt = await provider
      .request({
        method: 'eth_getTransactionReceipt',
        params: [hash],
      })
      .catch(() => null)

    if (receipt && typeof receipt === 'object') {
      const status = (receipt as { status?: unknown }).status

      if (status === '0x0') {
        throw new Error(`${label} transaction reverted: ${hash}`)
      }

      return
    }

    await delay(TRANSACTION_RECEIPT_DELAY_MS)
  }

  throw new Error(`${label} transaction was submitted but not confirmed yet: ${hash}`)
}

async function waitForGatewayBalance(address: `0x${string}`, requiredAtomic: string) {
  for (let attempt = 0; attempt < GATEWAY_BALANCE_POLL_ATTEMPTS; attempt += 1) {
    const balance = await gatewayBalanceFor(address)

    if (BigInt(balance.gatewayAvailableAtomic) >= BigInt(requiredAtomic)) {
      return balance
    }

    await delay(GATEWAY_BALANCE_POLL_DELAY_MS)
  }

  return gatewayBalanceFor(address)
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

async function gatewayBalanceFor(address: `0x${string}`) {
  const response = await apiFetch(`/api/gateway/balances/${address}`)
  const data = (await response.json().catch(() => null)) as GatewayBalanceResult | { error?: string } | null

  if (response.status === 404) {
    throw new Error('Gateway balance endpoint is not loaded. Restart the API with npm.cmd run api, then refresh the app.')
  }

  if (!response.ok || !isGatewayBalanceResult(data)) {
    throw new Error(
      `Could not check Gateway balance for ${shortAddress(address)}: ${
        data && 'error' in data && data.error ? data.error : response.statusText
      }`,
    )
  }

  return data
}

async function fundGatewayFromWallet(
  provider: EthereumProvider,
  address: `0x${string}`,
  option: GatewayPaymentOption,
  depositAtomic: bigint,
  options?: PayReportOptions,
) {
  const token = checksumAddress(option.asset || ARC_USDC_ADDRESS, 'Gateway USDC token')
  const gatewayWallet = checksumAddress(
    option.extra?.verifyingContract || ARC_GATEWAY_WALLET_ADDRESS,
    'Gateway Wallet contract',
  )
  const depositLabel = formatAtomicUsdc(depositAtomic.toString())

  emitPaymentStatus(
    options,
    'checking-wallet',
    `Gateway needs ${depositLabel} more USDC. Checking the buyer wallet balance on Arc.`,
  )

  const walletBalance = await readUsdcBalance(provider, token, address)

  if (walletBalance < depositAtomic) {
    throw new Error(
      `Gateway balance is low and ${shortAddress(address)} only has ${formatUnits(walletBalance, 6)} Arc USDC available. Need ${depositLabel} USDC. Fund this wallet from the Arc faucet or use Sponsored demo.`,
    )
  }

  const allowance = await readUsdcAllowance(provider, token, address, gatewayWallet)

  if (allowance < depositAtomic) {
    const approvalData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [gatewayWallet, depositAtomic],
    })

    emitPaymentStatus(
      options,
      'approving-gateway',
      `Approve Circle Gateway to move ${depositLabel} USDC from the buyer wallet.`,
    )

    const approvalTxHash = await sendContractTransaction(
      provider,
      address,
      token,
      approvalData,
      'Gateway approval',
    )

    await waitForTransactionReceipt(provider, approvalTxHash, 'Gateway approval')
  }

  const depositData = encodeFunctionData({
    abi: gatewayWalletAbi,
    functionName: 'deposit',
    args: [token, depositAtomic],
  })

  emitPaymentStatus(
    options,
    'depositing-gateway',
    `Deposit ${depositLabel} USDC into Circle Gateway, then Trench will retry the x402 payment.`,
  )

  const depositTxHash = await sendContractTransaction(
    provider,
    address,
    gatewayWallet,
    depositData,
    'Gateway deposit',
    '0x1d4c0',
  )

  await waitForTransactionReceipt(provider, depositTxHash, 'Gateway deposit')

  return depositTxHash
}

async function ensureGatewayBalance(
  provider: EthereumProvider,
  address: `0x${string}`,
  option: GatewayPaymentOption,
  options?: PayReportOptions,
) {
  const requiredAtomic = option.amount

  emitPaymentStatus(options, 'checking-gateway', 'Checking Circle Gateway balance for this buyer wallet.')
  const balance = await gatewayBalanceFor(address)

  if (BigInt(balance.gatewayAvailableAtomic) >= BigInt(requiredAtomic)) {
    return balance
  }

  const depositAtomic = BigInt(requiredAtomic) - BigInt(balance.gatewayAvailableAtomic)
  await fundGatewayFromWallet(provider, address, option, depositAtomic, options)

  emitPaymentStatus(options, 'waiting-gateway', 'Gateway deposit confirmed. Waiting for Circle Gateway to index it.')
  const nextBalance = await waitForGatewayBalance(address, requiredAtomic)

  if (BigInt(nextBalance.gatewayAvailableAtomic) < BigInt(requiredAtomic)) {
    throw new Error(
      `Gateway deposit was confirmed, but Gateway still shows ${nextBalance.gatewayAvailable} USDC for ${shortAddress(address)}. Wait a few seconds and click Pay from buyer wallet again.`,
    )
  }

  return nextBalance
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
  const transferTypes = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  } as const
  const typedData = {
    domain: {
      name: GATEWAY_BATCHING_NAME,
      version: GATEWAY_BATCHING_VERSION,
      chainId: Number(ARC_TESTNET_NETWORK.split(':')[1]),
      verifyingContract,
    },
    types: transferTypes,
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
  const walletTypedData = {
    ...typedData,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...transferTypes,
    },
  } as const
  let signature: unknown

  try {
    signature = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [authorization.from, stringifyTypedDataForWallet(walletTypedData)],
    })
  } catch (error) {
    const code = rpcErrorCode(error)
    const message = rpcErrorMessage(error)

    if (code === 4001) {
      throw new Error('Wallet signature was rejected. Confirm the x402 authorization to pay from this wallet.', {
        cause: error,
      })
    }

    if (code === 4100 || message.toLowerCase().includes('not been authorized')) {
      throw new Error(
        `Wallet has not authorized ${shortAddress(authorization.from)} to sign for Trench. Disconnect, reconnect that exact account, then try payment again.`,
        { cause: error },
      )
    }

    throw new Error(`Wallet signature request failed: ${message}`, { cause: error })
  }

  const paymentSignature = assertHex(signature)
  const recoveredAddress = await recoverTypedDataAddress({
    ...typedData,
    signature: paymentSignature,
  })

  if (normalizeAddress(recoveredAddress) !== normalizeAddress(authorization.from)) {
    throw new Error(
      `Wallet signed from ${shortAddress(recoveredAddress)}, but Trench requested ${shortAddress(authorization.from)}. Open the selected wallet, switch to ${shortAddress(authorization.from)}, or disable competing wallet extensions for this test.`,
    )
  }

  return {
    signerAddress: authorization.from as `0x${string}`,
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

export async function payReportFromBuyerWallet(marketId: string, reportHash: string, options?: PayReportOptions) {
  const wallet = await ensureWallet()
  const provider = wallet.provider
  const buyerAddress = await connectBuyerWallet(provider)
  const existingSession = readStoredWalletSession()
  const paymentAddress =
    existingSession &&
    walletMatchesSession(wallet, existingSession) &&
    normalizeAddress(existingSession.address) === normalizeAddress(buyerAddress)
      ? existingSession.address
      : buyerAddress

  writeWalletSession(
    wallet,
    paymentAddress,
    existingSession && normalizeAddress(existingSession.address) === normalizeAddress(paymentAddress)
      ? existingSession.verificationSignature
      : undefined,
  )
  const body: UnlockBody = { marketId, reportHash, buyerAddress: paymentAddress }
  const serializedBody = JSON.stringify(body)

  emitPaymentStatus(options, 'requesting-challenge', 'Requesting the x402 payment challenge for this report.')
  const initialResponse = await apiFetch('/api/reports/unlock', {
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

    const error = await initialResponse.json().catch(() => null)
    const message = paymentErrorMessage(error, initialResponse.statusText || 'API route unavailable')

    throw new Error(`Report unlock failed before payment (${initialResponse.status}): ${message}`)
  }

  const paymentRequiredHeader = initialResponse.headers.get('PAYMENT-REQUIRED')

  if (!paymentRequiredHeader) {
    throw new Error('The x402 server did not return a PAYMENT-REQUIRED header.')
  }

  const paymentRequired = decodePaymentRequired(paymentRequiredHeader)
  const gatewayOption = selectGatewayOption(paymentRequired)
  await ensureArcTestnet(provider)
  const activeAddress = await activeWalletAddress(provider)

  if (activeAddress && normalizeAddress(activeAddress) !== normalizeAddress(paymentAddress)) {
    throw new Error(
      `${wallet.info.name} returned ${shortAddress(activeAddress)} as the active account, but Trench is connected to ${shortAddress(paymentAddress)}. Switch the wallet account to ${shortAddress(paymentAddress)} or reconnect the wallet from Trench.`,
    )
  }

  await ensureGatewayBalance(provider, paymentAddress, gatewayOption, options)
  emitPaymentStatus(options, 'signing-payment', 'Gateway is funded. Sign the x402 authorization to pay the seller.')
  const paymentPayload = await createPaymentPayload(
    provider,
    paymentAddress,
    paymentRequired.x402Version || 2,
    gatewayOption,
  )
  writeWalletSession(wallet, paymentPayload.signerAddress, existingSession?.verificationSignature)
  emitPaymentStatus(options, 'settling-payment', 'Submitting the signed x402 payment for Gateway settlement.')
  const paidResponse = await apiFetch('/api/reports/unlock', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Payment-Signature': encodePaymentSignature({
        x402Version: paymentPayload.x402Version,
        payload: paymentPayload.payload,
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
