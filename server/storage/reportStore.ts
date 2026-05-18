import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AgentReport } from '../types.js'

export type ReportEntitlement = {
  id: string
  buyerAddress: string
  marketId: string
  firstReportHash: string
  latestReportHash: string
  mode: 'gateway' | 'sponsored'
  amount?: string
  network?: string
  txHash?: string
  createdAt: string
  updatedAt: string
}

type StoreFile = {
  version: 2
  reports: Record<string, AgentReport>
  reportVersions: AgentReport[]
  entitlements: ReportEntitlement[]
}

type LegacyStoreFile = {
  version?: 1
  reports?: Record<string, AgentReport>
  entitlements?: Array<{
    id: string
    buyerAddress: string
    marketId: string
    reportHash: string
    mode: 'gateway' | 'sponsored'
    amount?: string
    network?: string
    txHash?: string
    createdAt: string
  }>
}

type EntitlementInput = {
  buyerAddress: string
  marketId: string
  reportHash: string
  mode: ReportEntitlement['mode']
  amount?: string
  network?: string
  txHash?: string
}

type SupabaseReportRow = {
  market_id: string
  report_hash: string
  version: number
  is_current: boolean
  report: AgentReport
  created_at?: string
  updated_at?: string
}

type SupabaseEntitlementRow = {
  id: string
  buyer_address: string
  market_id: string
  first_report_hash: string
  latest_report_hash: string
  mode: ReportEntitlement['mode']
  amount?: string
  network?: string
  tx_hash?: string
  created_at: string
  updated_at: string
}

type StoredEntitlement = ReportEntitlement | NonNullable<LegacyStoreFile['entitlements']>[number]

const storePath = process.env.TRENCH_STORE_PATH || join(process.cwd(), 'data', 'trench-store.json')
const reports = new Map<string, AgentReport>()
const reportVersions = new Map<string, AgentReport>()
const entitlements = new Map<string, ReportEntitlement>()

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return undefined
  }

  return { url, key }
}

function reportVersionKey(marketId: string, reportHash: string) {
  return `${marketId}:${reportHash}`
}

function entitlementKey(buyerAddress: string, marketId: string) {
  return `${normalizeBuyerAddress(buyerAddress)}:${marketId}`
}

function latestVersionNumber(marketId: string) {
  let maxVersion = 0

  for (const report of reportVersions.values()) {
    if (report.marketId === marketId) {
      maxVersion = Math.max(maxVersion, report.version || 0)
    }
  }

  return maxVersion
}

function normalizeReportVersion(report: AgentReport) {
  const existing = reportVersions.get(reportVersionKey(report.marketId, report.reportHash))
  const version = existing?.version || report.version || latestVersionNumber(report.marketId) + 1

  return {
    ...report,
    version,
  } satisfies AgentReport
}

function loadStore() {
  if (!existsSync(storePath)) {
    return
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf-8')) as Partial<StoreFile> & LegacyStoreFile
    const latestReports = Object.values(parsed.reports || {})
    const versions = parsed.reportVersions || latestReports

    for (const report of versions) {
      const normalized = normalizeReportVersion(report)
      reportVersions.set(reportVersionKey(normalized.marketId, normalized.reportHash), normalized)
    }

    for (const report of latestReports) {
      const normalized =
        reportVersions.get(reportVersionKey(report.marketId, report.reportHash)) || normalizeReportVersion(report)
      reports.set(normalized.marketId, normalized)
    }

    for (const entitlement of (parsed.entitlements || []) as StoredEntitlement[]) {
      const legacyReportHash = 'reportHash' in entitlement ? entitlement.reportHash : entitlement.latestReportHash
      const latestReportHash = 'latestReportHash' in entitlement ? entitlement.latestReportHash : legacyReportHash
      const firstReportHash = 'firstReportHash' in entitlement ? entitlement.firstReportHash : legacyReportHash
      const now = new Date().toISOString()
      const normalized = {
        id: entitlementKey(entitlement.buyerAddress, entitlement.marketId),
        buyerAddress: normalizeBuyerAddress(entitlement.buyerAddress),
        marketId: entitlement.marketId,
        firstReportHash,
        latestReportHash,
        mode: entitlement.mode,
        amount: entitlement.amount,
        network: entitlement.network,
        txHash: entitlement.txHash,
        createdAt: entitlement.createdAt || now,
        updatedAt: 'updatedAt' in entitlement ? entitlement.updatedAt : now,
      } satisfies ReportEntitlement

      entitlements.set(normalized.id, normalized)
    }
  } catch {
    return
  }
}

function persistStore() {
  mkdirSync(dirname(storePath), { recursive: true })

  const payload: StoreFile = {
    version: 2,
    reports: Object.fromEntries(reports.entries()),
    reportVersions: [...reportVersions.values()],
    entitlements: [...entitlements.values()],
  }
  const temporaryPath = `${storePath}.tmp`

  writeFileSync(temporaryPath, JSON.stringify(payload, null, 2))
  renameSync(temporaryPath, storePath)
}

async function supabaseRequest<T>(path: string, init?: RequestInit) {
  const config = supabaseConfig()

  if (!config) {
    return undefined
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText)
    throw new Error(`Supabase request failed (${response.status}): ${body}`)
  }

  if (response.status === 204) {
    return undefined
  }

  return (await response.json()) as T
}

function reportRow(report: AgentReport, isCurrent: boolean): SupabaseReportRow {
  return {
    market_id: report.marketId,
    report_hash: report.reportHash,
    version: report.version || 1,
    is_current: isCurrent,
    report,
  }
}

function entitlementRow(entitlement: ReportEntitlement): SupabaseEntitlementRow {
  return {
    id: entitlement.id,
    buyer_address: entitlement.buyerAddress,
    market_id: entitlement.marketId,
    first_report_hash: entitlement.firstReportHash,
    latest_report_hash: entitlement.latestReportHash,
    mode: entitlement.mode,
    amount: entitlement.amount,
    network: entitlement.network,
    tx_hash: entitlement.txHash,
    created_at: entitlement.createdAt,
    updated_at: entitlement.updatedAt,
  }
}

async function persistReportToSupabase(report: AgentReport) {
  if (!supabaseConfig()) {
    return
  }

  await supabaseRequest(`reports?market_id=eq.${encodeURIComponent(report.marketId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_current: false }),
  })
  await supabaseRequest('reports?on_conflict=market_id,report_hash', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(reportRow(report, true)),
  })
}

async function persistEntitlementToSupabase(entitlement: ReportEntitlement) {
  if (!supabaseConfig()) {
    return
  }

  await supabaseRequest('report_entitlements?on_conflict=buyer_address,market_id', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(entitlementRow(entitlement)),
  })
}

function rememberReport(report: AgentReport) {
  const normalized = normalizeReportVersion(report)

  reportVersions.set(reportVersionKey(normalized.marketId, normalized.reportHash), normalized)
  reports.set(normalized.marketId, normalized)

  return normalized
}

export function normalizeBuyerAddress(value?: string) {
  return (value || '').trim().toLowerCase()
}

export async function hydratePersistentStore() {
  const config = supabaseConfig()

  if (!config) {
    return
  }

  const [reportRows, entitlementRows] = await Promise.all([
    supabaseRequest<SupabaseReportRow[]>('reports?select=*&order=version.asc'),
    supabaseRequest<SupabaseEntitlementRow[]>('report_entitlements?select=*'),
  ])

  for (const row of reportRows || []) {
    const report = {
      ...row.report,
      version: row.version,
    } satisfies AgentReport

    reportVersions.set(reportVersionKey(row.market_id, row.report_hash), report)

    if (row.is_current) {
      reports.set(row.market_id, report)
    }
  }

  for (const row of entitlementRows || []) {
    entitlements.set(entitlementKey(row.buyer_address, row.market_id), {
      id: row.id,
      buyerAddress: normalizeBuyerAddress(row.buyer_address),
      marketId: row.market_id,
      firstReportHash: row.first_report_hash,
      latestReportHash: row.latest_report_hash,
      mode: row.mode,
      amount: row.amount,
      network: row.network,
      txHash: row.tx_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }

  persistStore()
}

loadStore()

export function getReport(marketId: string) {
  return reports.get(marketId)
}

export function getReportVersions(marketId: string) {
  return [...reportVersions.values()]
    .filter((report) => report.marketId === marketId)
    .sort((left, right) => (right.version || 0) - (left.version || 0))
}

export function saveReport(report: AgentReport) {
  const normalized = rememberReport(report)

  persistStore()
  void persistReportToSupabase(normalized).catch((error) => {
    console.warn(error instanceof Error ? error.message : 'Supabase report persistence failed.')
  })

  return normalized
}

export function hasReportEntitlement(buyerAddress: string | undefined, marketId: string) {
  if (!buyerAddress) {
    return false
  }

  return entitlements.has(entitlementKey(buyerAddress, marketId))
}

export function getReportEntitlement(buyerAddress: string | undefined, marketId: string) {
  if (!buyerAddress) {
    return undefined
  }

  return entitlements.get(entitlementKey(buyerAddress, marketId))
}

export function grantReportEntitlement(input: EntitlementInput) {
  const buyerAddress = normalizeBuyerAddress(input.buyerAddress)

  if (!buyerAddress) {
    return undefined
  }

  const id = entitlementKey(buyerAddress, input.marketId)
  const previous = entitlements.get(id)
  const now = new Date().toISOString()
  const entitlement = {
    id,
    buyerAddress,
    marketId: input.marketId,
    firstReportHash: previous?.firstReportHash || input.reportHash,
    latestReportHash: input.reportHash,
    mode: input.mode,
    amount: input.amount || previous?.amount,
    network: input.network || previous?.network,
    txHash: input.txHash || previous?.txHash,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  } satisfies ReportEntitlement

  entitlements.set(id, entitlement)
  persistStore()
  void persistEntitlementToSupabase(entitlement).catch((error) => {
    console.warn(error instanceof Error ? error.message : 'Supabase entitlement persistence failed.')
  })

  return entitlement
}
