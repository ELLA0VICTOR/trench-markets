import { buildFairPrice, clamp, edgeBpsFor, signalFor } from '../lib/math.js'
import type { EvidenceBrief, EvidenceItem, EvidenceSourceTarget, Market, Signal } from '../types.js'

type RawEvidence = {
  title: string
  source: string
  url?: string
  publishedAt?: string
  summary?: string
  kind: EvidenceItem['kind']
}

type EvidencePlan = EvidenceBrief['plan']
type EventType = EvidencePlan['eventType']

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

const AMBIGUITY_TERMS = [
  'alleged',
  'could',
  'expected',
  'may',
  'might',
  'reportedly',
  'rumor',
  'sources',
  'unconfirmed',
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

const ENTITY_SOURCE_MAP: Record<string, Array<Omit<EvidenceSourceTarget, 'status'>>> = {
  apple: [
    {
      label: 'Apple Newsroom',
      url: 'https://www.apple.com/newsroom/',
      reason: 'Primary company announcements.',
    },
  ],
  arc: [
    {
      label: 'Arc Network',
      url: 'https://arc.network/',
      reason: 'Primary Arc network updates.',
    },
    {
      label: 'Arc Docs',
      url: 'https://docs.arc.network/',
      reason: 'Developer-facing Arc technical changes.',
    },
  ],
  circle: [
    {
      label: 'Circle Newsroom',
      url: 'https://www.circle.com/newsroom',
      reason: 'Primary Circle product and stablecoin updates.',
    },
    {
      label: 'Circle Developers',
      url: 'https://developers.circle.com/',
      reason: 'Developer API and Gateway changes.',
    },
  ],
  fed: [
    {
      label: 'Federal Reserve',
      url: 'https://www.federalreserve.gov/newsevents.htm',
      reason: 'Primary Federal Reserve statements and calendars.',
    },
  ],
  bls: [
    {
      label: 'Bureau of Labor Statistics',
      url: 'https://www.bls.gov/news.release/',
      reason: 'Primary US labor and inflation data releases.',
    },
  ],
  bea: [
    {
      label: 'Bureau of Economic Analysis',
      url: 'https://www.bea.gov/news',
      reason: 'Primary US GDP and income data releases.',
    },
  ],
  congress: [
    {
      label: 'US Congress',
      url: 'https://www.congress.gov/',
      reason: 'Primary bill text, actions, and vote records.',
    },
  ],
  google: [
    {
      label: 'Google Blog',
      url: 'https://blog.google/',
      reason: 'Primary Google product announcements.',
    },
  ],
  microsoft: [
    {
      label: 'Microsoft News',
      url: 'https://news.microsoft.com/',
      reason: 'Primary Microsoft announcements.',
    },
  ],
  microstrategy: [
    {
      label: 'Strategy Investor Relations',
      url: 'https://www.strategy.com/investor-relations',
      reason: 'Primary Strategy/MicroStrategy treasury and investor disclosures.',
    },
  ],
  nato: [
    {
      label: 'NATO News',
      url: 'https://www.nato.int/cps/en/natohq/news.htm',
      reason: 'Primary NATO statements.',
    },
  ],
  nvidia: [
    {
      label: 'NVIDIA Newsroom',
      url: 'https://nvidianews.nvidia.com/',
      reason: 'Primary NVIDIA announcements.',
    },
    {
      label: 'NVIDIA Investor Relations',
      url: 'https://investor.nvidia.com/news/',
      reason: 'Material company disclosures.',
    },
  ],
  openai: [
    {
      label: 'OpenAI News',
      url: 'https://openai.com/news/',
      reason: 'Primary OpenAI announcements.',
    },
  ],
  treasury: [
    {
      label: 'US Treasury',
      url: 'https://home.treasury.gov/news/press-releases',
      reason: 'Primary sanctions, treasury, and public-finance announcements.',
    },
  ],
  uk: [
    {
      label: 'UK Government',
      url: 'https://www.gov.uk/search/news-and-communications',
      reason: 'Primary UK government announcements.',
    },
  ],
  whitehouse: [
    {
      label: 'White House',
      url: 'https://www.whitehouse.gov/briefing-room/',
      reason: 'Primary US executive announcements.',
    },
  ],
  sec: [
    {
      label: 'SEC Press Releases',
      url: 'https://www.sec.gov/newsroom/press-releases',
      reason: 'Primary US securities regulator updates.',
    },
  ],
  tesla: [
    {
      label: 'Tesla Investor Relations',
      url: 'https://ir.tesla.com/',
      reason: 'Primary Tesla investor disclosures.',
    },
  ],
}

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

  if (item.kind === 'official') return 0.95
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
  const ambiguity = countTerms(text, AMBIGUITY_TERMS)
  const diff = support - against

  if (Math.abs(diff) < 1) {
    return {
      stance: ambiguity > 0 ? ('ambiguous' as const) : ('neutral' as const),
      impact: 0,
    }
  }

  const ambiguityDiscount = ambiguity > 0 ? 0.72 : 1
  const impact = clamp(diff * 0.022 * relevance * reliability * ambiguityDiscount, -0.075, 0.075)

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
        'user-agent': 'trench-markets-evidence-engine/2.0',
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

async function fetchOfficialEvidence(target: EvidenceSourceTarget, query: string): Promise<RawEvidence[]> {
  const host = hostFor(target.url)
  if (!host) return []

  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc')
  url.searchParams.set('query', `${query} domain:${host}`)
  url.searchParams.set('mode', 'artlist')
  url.searchParams.set('format', 'json')
  url.searchParams.set('maxrecords', '4')
  url.searchParams.set('sort', 'HybridRel')
  url.searchParams.set('timespan', '12Months')

  const data = (await fetchJson(url.toString(), 3600)) as {
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
      source: target.label,
      url: article.url || target.url,
      publishedAt: article.seendate,
      summary: target.reason,
      kind: 'official' as const,
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
        'microstrategy',
        'strategy',
        'ethereum',
        'eth',
        'circle',
        'arc',
        'usdc',
        'fed',
        'bls',
        'bea',
        'treasury',
        'congress',
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

function eventTypeFor(text: string, category: string): EventType {
  const normalized = text.toLowerCase()

  if (/\b(election|vote|wins?|nominee|president|senate|parliament)\b/.test(normalized)) return 'election'
  if (/\b(above|below|over|under|reach|clear|exceed|close|price|transactions?|volume|threshold)\b/.test(normalized)) {
    return 'threshold'
  }
  if (/\b(approve|ban|bill|court|law|policy|regulation|rule|sanction|tariff)\b/.test(normalized) || category === 'policy') {
    return 'policy'
  }
  if (/\b(ipo|launch|release|ship|deploy|mainnet|testnet)\b/.test(normalized)) return 'launch'
  if (/\b(announce|announces|announcement|statement|earnings|report|files?|sells?|buys?|acquires?|merger)\b/.test(normalized)) return 'announcement'
  if (category === 'crypto' && /\b(btc|bitcoin|eth|ethereum|usd|\$)\b/.test(normalized)) return 'price'

  return 'general'
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
  const eventType = eventTypeFor(`${market.title} ${market.description || ''}`, category)
  const queries = [
    primary || event,
    `${event} latest`,
    `${event} official`,
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
    eventType,
    entities,
    queries: [...new Set(queries)].slice(0, 4),
    resolutionNotes,
  }
}

function baseRateFor(plan: EvidencePlan) {
  if (plan.eventType === 'announcement') return 'Announcement markets need primary-source confirmation; rumor is discounted unless multiple reliable sources agree.'
  if (plan.eventType === 'threshold') return 'Threshold markets are path-dependent; liquidity and deadline compression carry more weight than generic headlines.'
  if (plan.eventType === 'policy') return 'Policy markets require official text or calendar evidence; press commentary is treated as weak signal.'
  if (plan.eventType === 'launch') return 'Launch markets favor official release notes, deployment artifacts, and developer adoption evidence.'
  if (plan.category === 'crypto') return 'Crypto event markets overreact to headlines; require liquidity confirmation.'
  if (plan.category === 'macro') return 'Macro events move on official data calendars; rumor has lower weight.'
  if (plan.category === 'policy') return 'Policy markets need primary-source confirmation and are vulnerable to wording ambiguity.'
  if (plan.category === 'technology') return 'Technology/news markets favor fresh primary announcements and developer adoption signals.'

  return 'General event market; forecast starts from the traded price and moves only on sourced evidence.'
}

function officialTargetsFor(plan: EvidencePlan): EvidenceSourceTarget[] {
  const lowerEntities = plan.entities.map((entity) => entity.toLowerCase())
  const targets: Array<Omit<EvidenceSourceTarget, 'status'>> = []

  for (const entity of lowerEntities) {
    for (const [key, value] of Object.entries(ENTITY_SOURCE_MAP)) {
      if (entity.includes(key) || key.includes(entity)) {
        targets.push(...value)
      }
    }
  }

  if (plan.category === 'macro') {
    targets.push(...ENTITY_SOURCE_MAP.fed, ...ENTITY_SOURCE_MAP.bls, ...ENTITY_SOURCE_MAP.bea, ...ENTITY_SOURCE_MAP.treasury)
  }

  if (plan.category === 'policy') {
    targets.push(
      ...ENTITY_SOURCE_MAP.whitehouse,
      ...ENTITY_SOURCE_MAP.congress,
      {
        label: 'US Federal Register',
        url: 'https://www.federalregister.gov/',
        reason: 'Primary US rulemaking and official notices.',
      },
      {
        label: 'SEC Press Releases',
        url: 'https://www.sec.gov/newsroom/press-releases',
        reason: 'Primary US securities regulator updates.',
      },
    )
  }

  if (plan.category === 'crypto') {
    targets.push(
      {
        label: 'SEC Press Releases',
        url: 'https://www.sec.gov/newsroom/press-releases',
        reason: 'Primary ETF/enforcement regulator updates.',
      },
      {
        label: 'CFTC Press Room',
        url: 'https://www.cftc.gov/PressRoom/PressReleases',
        reason: 'Primary derivatives regulator updates.',
      },
    )
  }

  if (plan.category === 'technology') {
    targets.push(
      {
        label: 'SEC EDGAR',
        url: 'https://www.sec.gov/edgar/search/',
        reason: 'Material public-company filings.',
      },
    )
  }

  return [...new Map(targets.map((target) => [target.url, target])).values()]
    .slice(0, 5)
    .map((target) => ({ ...target, status: 'searched' as const }))
}

function microstructureDeltaFor(market: Market) {
  const liquidityScore = clamp(Math.log10(Math.max(10, market.liquidity)) / 7, 0, 1)
  const volumeScore = clamp(Math.log10(Math.max(10, market.volume24h)) / 7, 0, 1)
  const depth = (liquidityScore + volumeScore) / 2
  const deterministicPrior = buildFairPrice(market.title, market.price)

  return clamp((deterministicPrior - market.price) * (0.16 + depth * 0.18), -0.055, 0.055)
}

function liquidityGradeFor(market: Market): EvidenceBrief['diagnostics']['liquidityGrade'] {
  const depth = market.liquidity + market.volume24h * 0.35

  if (depth >= 1_500_000) return 'deep'
  if (depth >= 350_000) return 'healthy'
  if (depth >= 90_000) return 'thin'
  return 'fragile'
}

function deadlinePressureFor(market: Market): EvidenceBrief['diagnostics']['deadlinePressure'] {
  const daysUntilEnd = (new Date(market.endDate).getTime() - Date.now()) / 86_400_000

  if (!Number.isFinite(daysUntilEnd)) return 'normal'
  if (daysUntilEnd <= 0) return 'expired'
  if (daysUntilEnd <= 2) return 'urgent'
  if (daysUntilEnd <= 10) return 'near'
  if (daysUntilEnd > 120) return 'long'
  return 'normal'
}

function sourceDiversityFor(items: EvidenceItem[]) {
  const external = items.filter((item) => item.kind !== 'fallback')
  const uniqueSources = new Set(external.map((item) => hostFor(item.url) || item.source.toLowerCase())).size

  return clamp(uniqueSources / 5, 0, 1)
}

function consensusFor(items: EvidenceItem[]): EvidenceBrief['diagnostics']['consensus'] {
  const yes = items
    .filter((item) => item.stance === 'supports-yes')
    .reduce((sum, item) => sum + Math.abs(item.impact), 0)
  const no = items
    .filter((item) => item.stance === 'supports-no')
    .reduce((sum, item) => sum + Math.abs(item.impact), 0)

  if (yes + no < 0.018) return 'thin'
  if (Math.abs(yes - no) < 0.025) return 'mixed'
  return yes > no ? 'pro-yes' : 'pro-no'
}

function contradictionScoreFor(items: EvidenceItem[]) {
  const yes = items.some((item) => item.stance === 'supports-yes')
  const no = items.some((item) => item.stance === 'supports-no')
  const ambiguous = items.filter((item) => item.stance === 'ambiguous').length

  return clamp((yes && no ? 0.46 : 0) + ambiguous * 0.08, 0, 0.9)
}

function manipulationRiskFor(
  market: Market,
  contradictionScore: number,
): EvidenceBrief['diagnostics']['manipulationRisk'] {
  const grade = liquidityGradeFor(market)

  if (grade === 'fragile' || (grade === 'thin' && contradictionScore > 0.35)) return 'high'
  if (grade === 'thin' || contradictionScore > 0.45) return 'medium'
  return 'low'
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

function confidenceCapFor(
  plan: EvidencePlan,
  items: EvidenceItem[],
  contradictionScore: number,
  liquidityGrade: EvidenceBrief['diagnostics']['liquidityGrade'],
) {
  const officialHits = items.filter((item) => item.kind === 'official').length
  const externalHits = items.filter((item) => item.kind !== 'fallback').length
  let cap = 0.91

  if (['announcement', 'policy', 'launch'].includes(plan.eventType) && officialHits === 0) {
    cap = Math.min(cap, 0.68)
  }

  if (externalHits < 3) {
    cap = Math.min(cap, 0.64)
  }

  if (contradictionScore > 0.45) {
    cap = Math.min(cap, 0.62)
  }

  if (liquidityGrade === 'fragile') {
    cap = Math.min(cap, 0.58)
  }

  return cap
}

function officialCoverageFor(items: EvidenceItem[], sources: EvidenceSourceTarget[]) {
  if (sources.length === 0) return 0

  const hits = new Set(
    items
      .filter((item) => item.kind === 'official')
      .map((item) => hostFor(item.url) || item.source.toLowerCase()),
  )

  return clamp(hits.size / sources.length, 0, 1)
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

  if (['announcement', 'policy', 'launch'].includes(plan.eventType) && !items.some((item) => item.kind === 'official')) {
    notes.push('No direct official-source hit was found, so announcement/policy evidence is treated as provisional.')
  }

  if (market.liquidity < 100_000) {
    notes.push('Thin liquidity can make the apparent edge hard to execute without moving the price.')
  }

  if (plan.resolutionNotes.length > 0) {
    notes.push('Resolution wording should be checked before size increases.')
  }

  return notes
}

function monitoringTriggers(
  plan: EvidencePlan,
  market: Market,
  sources: EvidenceSourceTarget[],
  diagnostics: EvidenceBrief['diagnostics'],
) {
  const consensusIsYes = diagnostics.consensus === 'pro-yes'
  const triggerPrice = clamp(market.price * 100 + (consensusIsYes ? 8 : -8), 1, 99)
  const triggers = [
    {
      trigger: `Price moves ${consensusIsYes ? 'above' : 'below'} ${Math.round(triggerPrice)}c`,
      reason: 'A fast price move can erase the edge or confirm that new information has arrived.',
    },
    {
      trigger: `New official update for ${plan.entities[0] || plan.category}`,
      reason: 'Primary-source evidence can override the current forecast.',
    },
  ]

  if (sources[0]) {
    triggers.push({
      trigger: `${sources[0].label} publishes a relevant update`,
      reason: sources[0].reason,
    })
  }

  if (diagnostics.manipulationRisk !== 'low') {
    triggers.push({
      trigger: 'Liquidity drops or one-sided volume spikes',
      reason: 'Thin markets can manufacture apparent signal without durable evidence.',
    })
  }

  if (diagnostics.contradictionScore > 0.35) {
    triggers.push({
      trigger: 'A high-reliability source contradicts the current thesis',
      reason: 'Contradiction is the fastest way for this report to become stale.',
    })
  }

  return triggers.slice(0, 4)
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
  const officialSources = officialTargetsFor(plan)
  const officialTasks = officialSources.map((target) =>
    fetchOfficialEvidence(target, query).then((items) => ({
      target,
      items,
    })),
  )
  const tasks: Array<Promise<RawEvidence[]>> = [
    fetchNewsEvidence(query),
    fetchReferenceEvidence(query),
    fetchDeveloperEvidence(`${plan.entities.slice(0, 2).join(' ')} ${plan.category}`.trim() || query),
  ]
  const [officialSettled, settled] = await Promise.all([
    Promise.allSettled(officialTasks),
    Promise.allSettled(tasks),
  ])
  const officialEvidence = officialSettled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value.items : [],
  )
  const officialSourcesWithStatus = officialSources.map((source) => {
    const host = hostFor(source.url)
    const hit = officialEvidence.some((item) => hostFor(item.url) === host || item.source === source.label)

    return {
      ...source,
      status: hit ? ('hit' as const) : ('missing' as const),
    }
  })
  const external = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

  return {
    rawEvidence: dedupeEvidence([...officialEvidence, ...external, ...fallbackEvidence(market)]).slice(0, 14),
    officialSources: officialSourcesWithStatus,
  }
}

export async function buildEvidenceBrief(market: Market): Promise<EvidenceBrief> {
  const plan = researchPlanFor(market)
  const { rawEvidence, officialSources } = await gatherRawEvidence(plan, market)
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
  const sourceDiversity = sourceDiversityFor(items)
  const consensus = consensusFor(items)
  const contradictionScore = contradictionScoreFor(items)
  const liquidityGrade = liquidityGradeFor(market)
  const deadlinePressure = deadlinePressureFor(market)
  const manipulationRisk = manipulationRiskFor(market, contradictionScore)
  const officialCoverage = officialCoverageFor(items, officialSources)
  const evidenceRawDelta = items.reduce((sum, item) => sum + item.impact, 0)
  const contradictionDiscount = 1 - contradictionScore * 0.45
  const diversityMultiplier = 0.9 + sourceDiversity * 0.18
  const evidenceDelta = clamp(evidenceRawDelta * contradictionDiscount * diversityMultiplier, -0.24, 0.24)
  const microstructureDelta = microstructureDeltaFor(market)
  const deadlineDelta = deadlineDeltaFor(market, evidenceDelta)
  const fairPrice = clamp(market.price + evidenceDelta + microstructureDelta + deadlineDelta, 0.03, 0.97)
  const edge = fairPrice - market.price
  const confidenceCap = confidenceCapFor(plan, items, contradictionScore, liquidityGrade)
  const rawConfidence = clamp(
    0.42 +
      Math.abs(edge) * 1.65 +
      quality * 0.2 +
      sourceDiversity * 0.08 +
      officialCoverage * 0.07 +
      Math.min(market.liquidity / 900_000, 1) * 0.06 -
      contradictionScore * 0.12,
    0.42,
    0.93,
  )
  const confidence = Math.min(rawConfidence, confidenceCap)
  const directionalAction = signalFor(market.price, fairPrice)
  const action = confidence < 0.54 ? ('PASS' as const) : directionalAction
  const skeptic = skepticNotes(plan, items, market)
  const verdict = verdictFor(action, edge, confidence, quality)
  const diagnostics: EvidenceBrief['diagnostics'] = {
    eventType: plan.eventType,
    consensus,
    contradictionScore: Number(contradictionScore.toFixed(4)),
    sourceDiversity: Number(sourceDiversity.toFixed(4)),
    liquidityGrade,
    deadlinePressure,
    manipulationRisk,
    confidenceCap: Number(confidenceCap.toFixed(4)),
    officialCoverage: Number(officialCoverage.toFixed(4)),
  }
  const monitoring = monitoringTriggers(plan, market, officialSources, diagnostics)
  const topEvidence = items
    .filter((item) => item.stance !== 'neutral')
    .sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact))[0]
  const summary =
    topEvidence && action !== 'PASS'
      ? `${action} from V2 consensus ${consensus}: ${topEvidence.source} moves fair value to ${Math.round(fairPrice * 100)}%, capped at ${Math.round(confidence * 100)}% confidence after official-source, contradiction, liquidity, and deadline checks.`
      : `PASS or watch closely: V2 evidence keeps fair value near ${Math.round(fairPrice * 100)}%, with ${consensus} consensus and ${Math.round(officialCoverage * 100)}% official-source coverage.`

  return {
    version: 'v2',
    plan,
    items,
    officialSources,
    forecast: {
      prior: Number(market.price.toFixed(4)),
      evidenceDelta: Number(evidenceDelta.toFixed(4)),
      microstructureDelta: Number(microstructureDelta.toFixed(4)),
      deadlineDelta: Number(deadlineDelta.toFixed(4)),
      fairPrice: Number(fairPrice.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      confidenceCap: Number(confidenceCap.toFixed(4)),
      evidenceQuality: Number(quality.toFixed(4)),
      officialCoverage: Number(officialCoverage.toFixed(4)),
      baseRate: baseRateFor(plan),
    },
    diagnostics,
    recommendation: {
      action,
      positionSize: positionSize(action, edge, confidence, quality),
      maxEntry: signalEntry(action, fairPrice, confidence),
      invalidation:
        action === 'PASS'
          ? 'Needs at least one fresh, high-reliability source or a meaningful price dislocation.'
          : `Invalidate if a primary source contradicts the ${plan.event} thesis or liquidity drops below executable depth.`,
    },
    monitoring,
    skeptic,
    summary,
    verdict,
  }
}

export function edgeBpsFromEvidence(market: Market, evidence: EvidenceBrief) {
  return edgeBpsFor(market.price, evidence.forecast.fairPrice)
}
