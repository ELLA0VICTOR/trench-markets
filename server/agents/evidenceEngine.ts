import { buildFairPrice, clamp, edgeBpsFor, signalFor } from '../lib/math.js'
import type { EvidenceBrief, EvidenceItem, Market, Signal } from '../types.js'

type RawEvidence = {
  title: string
  source: string
  url?: string
  publishedAt?: string
  summary?: string
  kind: 'news' | 'reference' | 'developer' | 'fallback'
}

type EvidencePlan = EvidenceBrief['plan']

const STOP_WORDS = new Set([
  'will',
  'would',
  'could',
  'should',
  'the',
  'this',
  'that',
  'there',
  'before',
  'after',
  'during',
  'with',
  'from',
  'into',
  'over',
  'under',
  'above',
  'below',
  'market',
  'markets',
  'prediction',
  'resolve',
  'resolved',
  'question',
  'yes',
  'no',
])

const SUPPORT_TERMS = [
  'approved',
  'announced',
  'confirmed',
  'launched',
  'passed',
  'reached',
  'signed',
  'wins',
  'surged',
  'increased',
  'record',
  'on track',
  'expects',
  'plans',
  'agreement',
  'official',
]

const AGAINST_TERMS = [
  'blocked',
  'cancelled',
  'canceled',
  'delayed',
  'denied',
  'failed',
  'fell',
  'halted',
  'missed',
  'rejected',
  'reversed',
  'suspended',
  'unlikely',
  'warning',
  'lawsuit',
  'probe',
  'sanction',
]

const HIGH_RELIABILITY_DOMAINS = [
  '.gov',
  '.edu',
  'sec.gov',
  'federalreserve.gov',
  'ecb.europa.eu',
  'nato.int',
  'un.org',
  'who.int',
  'circle.com',
  'arc.network',
  'investor.',
]

const NEWS_DOMAINS = [
  'apnews.com',
  'bbc.',
  'bloomberg.',
  'cnbc.com',
  'coindesk.com',
  'financialtimes.com',
  'ft.com',
  'reuters.com',
  'theverge.com',
  'wsj.com',
]

function wordsFor(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

function countTerms(text: string, terms: string[]) {
  const normalized = text.toLowerCase()

  return terms.reduce((count, term) => count + (normalized.includes(term) ? 1 : 0), 0)
}

function hostFor(url?: string) {
  if (!url) return ''

  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function reliabilityFor(item: RawEvidence) {
  const host = hostFor(item.url)

  if (HIGH_RELIABILITY_DOMAINS.some((domain) => host.includes(domain))) return 0.92
  if (NEWS_DOMAINS.some((domain) => host.includes(domain))) return 0.82
  if (item.kind === 'reference') return 0.72
  if (item.kind === 'developer') return 0.68
  if (item.kind === 'fallback') return 0.5

  return 0.62
}

function relevanceFor(plan: EvidencePlan, item: RawEvidence) {
  const targetWords = new Set(wordsFor(`${plan.event} ${plan.entities.join(' ')} ${plan.category}`))
  const itemWords = new Set(wordsFor(`${item.title} ${item.summary || ''} ${item.source}`))
  const overlap = [...targetWords].filter((word) => itemWords.has(word)).length
  const entityHit = plan.entities.some((entity) =>
    `${item.title} ${item.summary || ''}`.toLowerCase().includes(entity.toLowerCase()),
  )

  return clamp(0.2 + overlap / Math.max(5, targetWords.size) + (entityHit ? 0.28 : 0), 0.18, 0.96)
}

function stanceFor(raw: RawEvidence, relevance: number, reliability: number) {
  const text = `${raw.title}. ${raw.summary || ''}`
  const support = countTerms(text, SUPPORT_TERMS)
  const against = countTerms(text, AGAINST_TERMS)
  const diff = support - against

  if (Math.abs(diff) < 1) {
    return {
      stance: 'neutral' as const,
      impact: 0,
    }
  }

  const impact = clamp(diff * 0.022 * relevance * reliability, -0.075, 0.075)

  return {
    stance: impact > 0 ? ('supports-yes' as const) : ('supports-no' as const),
    impact,
  }
}

function dedupeEvidence(items: RawEvidence[]) {
  const seen = new Set<string>()

  return items.filter((item) => {
    const key = `${item.title.toLowerCase()}|${item.url || item.source}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function timeoutSignal(ms: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)

  return {
    signal: controller.signal,
    release: () => clearTimeout(timeout),
  }
}

async function fetchJson(url: string, ms = 4200) {
  const timeout = timeoutSignal(ms)

  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'trench-markets-evidence-engine/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Fetch failed ${response.status}`)
    }

    return await response.json()
  } finally {
    timeout.release()
  }
}

function cleanExcerpt(value: unknown) {
  if (typeof value !== 'string') return undefined

  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260)
}

async function fetchNewsEvidence(query: string): Promise<RawEvidence[]> {
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc')
  url.searchParams.set('query', query)
  url.searchParams.set('mode', 'artlist')
  url.searchParams.set('format', 'json')
  url.searchParams.set('maxrecords', '8')
  url.searchParams.set('sort', 'HybridRel')
  url.searchParams.set('timespan', '6Months')

  const data = (await fetchJson(url.toString())) as {
    articles?: Array<{
      title?: string
      url?: string
      seendate?: string
      sourceCommonName?: string
      domain?: string
    }>
  }

  return (data.articles || [])
    .filter((article) => article.title)
    .map((article) => ({
      title: String(article.title),
      source: article.sourceCommonName || article.domain || hostFor(article.url) || 'GDELT news',
      url: article.url,
      publishedAt: article.seendate,
      kind: 'news' as const,
    }))
}

async function fetchReferenceEvidence(query: string): Promise<RawEvidence[]> {
  const url = new URL('https://en.wikipedia.org/w/rest.php/v1/search/page')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '5')

  const data = (await fetchJson(url.toString())) as {
    pages?: Array<{
      title?: string
      description?: string
      excerpt?: string
      key?: string
    }>
  }

  return (data.pages || [])
    .filter((page) => page.title)
    .map((page) => ({
      title: String(page.title),
      source: 'Wikipedia reference',
      url: page.key ? `https://en.wikipedia.org/wiki/${page.key}` : undefined,
      summary: cleanExcerpt(page.excerpt) || page.description,
      kind: 'reference' as const,
    }))
}

async function fetchDeveloperEvidence(query: string): Promise<RawEvidence[]> {
  const url = new URL('https://hn.algolia.com/api/v1/search')
  url.searchParams.set('query', query)
  url.searchParams.set('tags', 'story')
  url.searchParams.set('hitsPerPage', '5')

  const data = (await fetchJson(url.toString())) as {
    hits?: Array<{
      title?: string
      url?: string
      created_at?: string
      author?: string
    }>
  }

  return (data.hits || [])
    .filter((hit) => hit.title)
    .map((hit) => ({
      title: String(hit.title),
      source: hit.author ? `Hacker News / ${hit.author}` : 'Hacker News',
      url: hit.url,
      publishedAt: hit.created_at,
      kind: 'developer' as const,
    }))
}

function fallbackEvidence(market: Market): RawEvidence[] {
  return [
    {
      title: `${market.category} market microstructure`,
      source: 'Trench market state',
      summary: `Market price ${Math.round(market.price * 100)}%, liquidity ${Math.round(market.liquidity)}, 24h volume ${Math.round(market.volume24h)}.`,
      kind: 'fallback',
    },
    {
      title: 'Resolution wording and deadline',
      source: 'Trench parser',
      summary: market.description || market.title,
      kind: 'fallback',
    },
  ]
}

function dateLabel(date: string) {
  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime())) {
    return 'No clear deadline parsed'
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function entityCandidates(text: string) {
  const capitalized = text.match(/\b[A-Z][A-Za-z0-9&.-]{2,}\b/g) || []
  const tickers = text.match(/\b[A-Z0-9]{2,6}\b/g) || []
  const known = wordsFor(text)
    .filter((word) =>
      [
        'bitcoin',
        'btc',
        'ethereum',
        'eth',
        'circle',
        'arc',
        'usdc',
        'fed',
        'nvidia',
        'openai',
        'apple',
        'google',
        'microsoft',
        'tesla',
      ].includes(word),
    )
    .map((word) => word.toUpperCase())

  return [...new Set([...capitalized, ...tickers, ...known])]
    .filter((entity) => !['Will', 'What', 'Who', 'When', 'Before', 'After'].includes(entity))
    .slice(0, 6)
}

function categoryFor(market: Market) {
  const text = `${market.category} ${market.title}`.toLowerCase()

  if (text.includes('crypto') || text.includes('bitcoin') || text.includes('btc') || text.includes('token')) {
    return 'crypto'
  }

  if (text.includes('fed') || text.includes('rate') || text.includes('inflation') || text.includes('macro')) {
    return 'macro'
  }

  if (text.includes('election') || text.includes('government') || text.includes('policy')) {
    return 'policy'
  }

  if (text.includes('ai') || text.includes('startup') || text.includes('developer') || text.includes('arc')) {
    return 'technology'
  }

  return market.category.toLowerCase() || 'general'
}

function eventFor(title: string) {
  return title
    .replace(/\?+$/g, '')
    .replace(/\bwill\b/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function researchPlanFor(market: Market): EvidencePlan {
  const event = eventFor(market.title)
  const entities = entityCandidates(`${market.title} ${market.category} ${market.participants.join(' ')}`)
  const keywords = wordsFor(event).slice(0, 8)
  const primary = [...entities.slice(0, 3), ...keywords.slice(0, 5)].join(' ')
  const category = categoryFor(market)
  const queries = [
    primary || event,
    `${event} latest`,
    `${entities.slice(0, 2).join(' ')} ${category} news`.trim(),
  ]
    .map((query) => query.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const resolutionNotes = [
    'Identify whether the title asks for a concrete event, threshold, or official announcement.',
    'Prefer primary/official sources when available; discount rumor and thin commentary.',
    'Treat ambiguous resolution text as a risk even when the signal has edge.',
  ]

  return {
    event,
    deadline: dateLabel(market.endDate),
    category,
    entities,
    queries: [...new Set(queries)].slice(0, 4),
    resolutionNotes,
  }
}

function baseRateFor(plan: EvidencePlan) {
  if (plan.category === 'crypto') return 'Crypto event markets overreact to headlines; require liquidity confirmation.'
  if (plan.category === 'macro') return 'Macro events move on official data calendars; rumor has lower weight.'
  if (plan.category === 'policy') return 'Policy markets need primary-source confirmation and are vulnerable to wording ambiguity.'
  if (plan.category === 'technology') return 'Technology/news markets favor fresh primary announcements and developer adoption signals.'

  return 'General event market; forecast starts from the traded price and moves only on sourced evidence.'
}

function microstructureDeltaFor(market: Market) {
  const liquidityScore = clamp(Math.log10(Math.max(10, market.liquidity)) / 7, 0, 1)
  const volumeScore = clamp(Math.log10(Math.max(10, market.volume24h)) / 7, 0, 1)
  const depth = (liquidityScore + volumeScore) / 2
  const deterministicPrior = buildFairPrice(market.title, market.price)

  return clamp((deterministicPrior - market.price) * (0.16 + depth * 0.18), -0.055, 0.055)
}

function deadlineDeltaFor(market: Market, evidenceDelta: number) {
  const daysUntilEnd = (new Date(market.endDate).getTime() - Date.now()) / 86_400_000

  if (!Number.isFinite(daysUntilEnd)) return 0
  if (daysUntilEnd <= 2 && evidenceDelta < 0.035) return -0.035
  if (daysUntilEnd <= 7 && evidenceDelta > 0.045) return 0.02
  if (daysUntilEnd > 180) return -0.012

  return 0
}

function qualityFor(items: EvidenceItem[]) {
  if (items.length === 0) return 0.18

  const weighted = items.reduce((sum, item) => sum + item.relevance * item.reliability, 0)
  const countBoost = clamp(items.length / 8, 0, 1) * 0.18

  return clamp(weighted / items.length + countBoost, 0.2, 0.95)
}

function signalEntry(signal: Signal, fairPrice: number, confidence: number) {
  const safetyMargin = confidence >= 0.72 ? 0.025 : 0.04

  if (signal === 'BUY YES') {
    return `Buy YES up to ${Math.max(1, Math.round((fairPrice - safetyMargin) * 100))}c`
  }

  if (signal === 'BUY NO') {
    return `Buy NO up to ${Math.max(1, Math.round((1 - fairPrice - safetyMargin) * 100))}c`
  }

  return 'No entry until evidence improves'
}

function positionSize(signal: Signal, edge: number, confidence: number, quality: number) {
  if (signal === 'PASS') return '0% bankroll'

  const raw = clamp(Math.abs(edge) * 18 + confidence * 1.2 + quality * 0.8 - 1.1, 0.3, 3.5)

  return `${raw.toFixed(1)}% bankroll cap`
}

function skepticNotes(plan: EvidencePlan, items: EvidenceItem[], market: Market) {
  const notes = [
    'The market can still move against the forecast if a single high-authority source contradicts the current packet.',
  ]

  if (items.filter((item) => item.kind !== 'fallback').length < 3) {
    notes.push('External evidence coverage is thin, so confidence is capped until more independent sources appear.')
  }

  if (market.liquidity < 100_000) {
    notes.push('Thin liquidity can make the apparent edge hard to execute without moving the price.')
  }

  if (plan.resolutionNotes.length > 0) {
    notes.push('Resolution wording should be checked before size increases.')
  }

  return notes
}

function verdictFor(signal: Signal, edge: number, confidence: number, quality: number): EvidenceBrief['verdict'] {
  if (signal === 'PASS') return 'pass'
  if (Math.abs(edge) > 0.14 && confidence > 0.72 && quality > 0.62) return 'strong'
  if (Math.abs(edge) > 0.08 && confidence > 0.61) return 'actionable'

  return 'watchlist'
}

function itemSummary(item: RawEvidence) {
  return item.summary || `External item from ${item.source}.`
}

async function gatherRawEvidence(plan: EvidencePlan, market: Market) {
  const query = plan.queries[0] || market.title
  const tasks: Array<Promise<RawEvidence[]>> = [
    fetchNewsEvidence(query),
    fetchReferenceEvidence(query),
    fetchDeveloperEvidence(`${plan.entities.slice(0, 2).join(' ')} ${plan.category}`.trim() || query),
  ]
  const settled = await Promise.allSettled(tasks)
  const external = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

  return dedupeEvidence([...external, ...fallbackEvidence(market)]).slice(0, 12)
}

export async function buildEvidenceBrief(market: Market): Promise<EvidenceBrief> {
  const plan = researchPlanFor(market)
  const rawEvidence = await gatherRawEvidence(plan, market)
  const items = rawEvidence.map((raw) => {
    const reliability = reliabilityFor(raw)
    const relevance = relevanceFor(plan, raw)
    const stance = stanceFor(raw, relevance, reliability)

    return {
      title: raw.title,
      source: raw.source,
      kind: raw.kind,
      url: raw.url,
      publishedAt: raw.publishedAt,
      summary: itemSummary(raw),
      reliability: Number(reliability.toFixed(2)),
      relevance: Number(relevance.toFixed(2)),
      stance: stance.stance,
      impact: Number(stance.impact.toFixed(4)),
    } satisfies EvidenceItem
  })
  const quality = qualityFor(items)
  const evidenceDelta = clamp(
    items.reduce((sum, item) => sum + item.impact, 0),
    -0.24,
    0.24,
  )
  const microstructureDelta = microstructureDeltaFor(market)
  const deadlineDelta = deadlineDeltaFor(market, evidenceDelta)
  const fairPrice = clamp(market.price + evidenceDelta + microstructureDelta + deadlineDelta, 0.03, 0.97)
  const edge = fairPrice - market.price
  const confidence = clamp(0.44 + Math.abs(edge) * 1.7 + quality * 0.25 + Math.min(market.liquidity / 900_000, 1) * 0.08, 0.45, 0.93)
  const action = signalFor(market.price, fairPrice)
  const skeptic = skepticNotes(plan, items, market)
  const verdict = verdictFor(action, edge, confidence, quality)
  const topEvidence = items
    .filter((item) => item.stance !== 'neutral')
    .sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact))[0]
  const summary =
    topEvidence && action !== 'PASS'
      ? `${action} because ${topEvidence.source} evidence moves fair value to ${Math.round(fairPrice * 100)}%, with ${Math.round(confidence * 100)}% confidence after liquidity and deadline checks.`
      : `PASS or watch closely: evidence keeps fair value near ${Math.round(fairPrice * 100)}%, so the market needs stronger confirmation before size.`

  return {
    plan,
    items,
    forecast: {
      prior: Number(market.price.toFixed(4)),
      evidenceDelta: Number(evidenceDelta.toFixed(4)),
      microstructureDelta: Number(microstructureDelta.toFixed(4)),
      deadlineDelta: Number(deadlineDelta.toFixed(4)),
      fairPrice: Number(fairPrice.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      evidenceQuality: Number(quality.toFixed(4)),
      baseRate: baseRateFor(plan),
    },
    recommendation: {
      action,
      positionSize: positionSize(action, edge, confidence, quality),
      maxEntry: signalEntry(action, fairPrice, confidence),
      invalidation:
        action === 'PASS'
          ? 'Needs at least one fresh, high-reliability source or a meaningful price dislocation.'
          : `Invalidate if a primary source contradicts the ${plan.event} thesis or liquidity drops below executable depth.`,
    },
    skeptic,
    summary,
    verdict,
  }
}

export function edgeBpsFromEvidence(market: Market, evidence: EvidenceBrief) {
  return edgeBpsFor(market.price, evidence.forecast.fairPrice)
}
