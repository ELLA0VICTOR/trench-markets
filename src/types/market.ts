export type Signal = 'BUY YES' | 'BUY NO' | 'PASS'

export type PaymentState = 'quote' | 'required' | 'settling' | 'paid' | 'publishing' | 'published'

export type FeedState = 'syncing' | 'live' | 'fallback'

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
