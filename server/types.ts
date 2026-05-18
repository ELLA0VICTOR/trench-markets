export type Signal = 'BUY YES' | 'BUY NO' | 'PASS'

export type MarketStatus = 'Live' | 'Resolved' | 'Ending Soon'

export type MarketTab =
  | 'New'
  | 'Trending'
  | 'Ending Soon'
  | 'Macro'
  | 'Crypto'
  | 'Arc'
  | 'Custom'

export type Market = {
  id: string
  title: string
  category: string
  source: string
  tab: MarketTab
  status: MarketStatus
  slug?: string
  imageUrl?: string
  description?: string
  price: number
  fairPrice: number
  volume24h: number
  liquidity: number
  endDate: string
  venue: string
  participants: string[]
  thumbnail: string
  tone: 'mint' | 'rose' | 'ivory' | 'blue' | 'violet' | 'amber'
  thesis: string
  catalysts: string[]
  risks: string[]
}

export type AgentRun = {
  agent:
    | 'Scout Agent'
    | 'Research Agent'
    | 'Analyst Agent'
    | 'Skeptic Agent'
    | 'Risk Agent'
    | 'Buyer Agent'
    | 'Arc Proof Agent'
  status: 'live' | 'simulated' | 'queued'
  summary: string
  artifact?: string
}

export type EvidenceItem = {
  title: string
  source: string
  kind: 'news' | 'reference' | 'developer' | 'fallback'
  url?: string
  publishedAt?: string
  summary: string
  reliability: number
  relevance: number
  stance: 'supports-yes' | 'supports-no' | 'neutral' | 'ambiguous'
  impact: number
}

export type EvidenceBrief = {
  plan: {
    event: string
    deadline: string
    category: string
    entities: string[]
    queries: string[]
    resolutionNotes: string[]
  }
  items: EvidenceItem[]
  forecast: {
    prior: number
    evidenceDelta: number
    microstructureDelta: number
    deadlineDelta: number
    fairPrice: number
    confidence: number
    evidenceQuality: number
    baseRate: string
  }
  recommendation: {
    action: Signal
    positionSize: string
    maxEntry: string
    invalidation: string
  }
  skeptic: string[]
  summary: string
  verdict: 'strong' | 'actionable' | 'watchlist' | 'pass'
}

export type PaymentChallenge = {
  statusCode: 402
  scheme: 'x402'
  network: 'Arc testnet'
  asset: 'USDC'
  amount: string
  receiver: string
  reportHash: string
  memo: string
  pricing: {
    model: 'trench-value-v1'
    minAmount: string
    maxAmount: string
    score: number
    rationale: string[]
  }
}

export type AgentReport = {
  marketId: string
  marketTitle: string
  signal: Signal
  fairPrice: number
  marketPrice: number
  confidence: number
  edgeBps: number
  reportHash: string
  thesis: string
  catalysts: string[]
  risks: string[]
  sources: string[]
  evidence?: EvidenceBrief
  createdAt: string
  locked: boolean
  challenge: PaymentChallenge
  runs: AgentRun[]
  proof?: {
    status: 'not_published' | 'queued' | 'published'
    proofId?: string
    txHash?: string
    contractAddress?: string
    blockNumber?: string
  }
}

export type GammaMarket = {
  id?: string | number
  question?: string
  slug?: string
  description?: string
  image?: string
  icon?: string
  outcomes?: string | string[]
  outcomePrices?: string | string[]
  volume24hr?: number | string
  volume24hrClob?: number | string
  liquidity?: number | string
  liquidityNum?: number | string
  endDate?: string
  endDateIso?: string
  active?: boolean
  closed?: boolean
}

export type GammaEvent = {
  id?: string | number
  title?: string
  ticker?: string
  slug?: string
  category?: string
  description?: string
  image?: string
  icon?: string
  volume24hr?: number | string
  liquidity?: number | string
  endDate?: string
  endDateIso?: string
  markets?: GammaMarket[]
}
