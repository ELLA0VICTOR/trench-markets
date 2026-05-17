import type { Market, MarketTab } from '../types/market'

export const marketTabs: MarketTab[] = [
  'New',
  'Trending',
  'Ending Soon',
  'Macro',
  'Crypto',
  'Arc',
  'Custom',
]

export const seedMarkets: Market[] = [
  {
    id: 'seed-fed-cut',
    title: 'Will the Fed cut rates before the July FOMC meeting?',
    category: 'Macro',
    source: 'Seed market',
    tab: 'Macro',
    status: 'Live',
    description:
      'A macro policy market scored from rate expectations, inflation prints, labor data, and FOMC communication risk.',
    price: 0.41,
    fairPrice: 0.53,
    volume24h: 2384000,
    liquidity: 912000,
    endDate: '2026-07-29T20:00:00.000Z',
    venue: 'Global',
    participants: ['FED', 'CPI', 'USD', 'BONDS', '+94 more'],
    thumbnail: 'FM',
    tone: 'ivory',
    thesis:
      'Front-end rates are pricing policy caution while labor softness is moving faster than the headline market price. The agent sees underpriced easing risk.',
    catalysts: ['June CPI print', 'Nonfarm payroll revisions', 'Fed speaker drift'],
    risks: ['Sticky services inflation', 'Oil shock', 'Hawkish dot-plot reset'],
  },
  {
    id: 'seed-arc-volume',
    title: 'Will Arc testnet clear 1M daily transactions before May 25?',
    category: 'Arc',
    source: 'Custom market',
    tab: 'Arc',
    status: 'Ending Soon',
    description:
      'A hackathon activity market focused on Arc testnet usage, RPC access, and builder deadline pressure.',
    price: 0.28,
    fairPrice: 0.36,
    volume24h: 184000,
    liquidity: 76000,
    endDate: '2026-05-25T05:00:00.000Z',
    venue: 'Arc testnet',
    participants: ['ARC', 'CLI', 'RPC', 'USDC', '+18 more'],
    thumbnail: 'A',
    tone: 'mint',
    thesis:
      'Hackathon usage, sample-app forks, and CLI-generated traffic create a reflexive path to a short activity spike, but the window is narrow.',
    catalysts: ['Agora builder traffic', 'RPC key issuance', 'Public demo deadlines'],
    risks: ['No public dashboard', 'Traffic clustered below threshold', 'Submission slippage'],
  },
  {
    id: 'seed-btc-close',
    title: 'Will BTC close above $110,000 on May 31?',
    category: 'Crypto',
    source: 'Seed market',
    tab: 'Crypto',
    status: 'Live',
    description:
      'A crypto direction market evaluated through spot momentum, ETF flows, perp funding, and liquidity pockets.',
    price: 0.34,
    fairPrice: 0.31,
    volume24h: 1249000,
    liquidity: 502000,
    endDate: '2026-05-31T23:59:59.000Z',
    venue: 'Global',
    participants: ['BTC', 'ETF', 'PERP', 'USD', '+42 more'],
    thumbnail: 'B',
    tone: 'amber',
    thesis:
      'Momentum remains constructive, but options positioning is already paying for the upside path. The agent wants a better entry.',
    catalysts: ['ETF flow acceleration', 'Dollar weakness', 'Weekend perp squeeze'],
    risks: ['Funding reset', 'Macro risk-off', 'Large holder distribution'],
  },
  {
    id: 'seed-election',
    title: 'Will a major G7 government announce a new AI compute export rule in June?',
    category: 'Policy',
    source: 'Custom market',
    tab: 'Trending',
    status: 'Live',
    description:
      'A policy and AI infrastructure market tracking public-sector compute restrictions and export-control signals.',
    price: 0.22,
    fairPrice: 0.37,
    volume24h: 326000,
    liquidity: 118000,
    endDate: '2026-06-30T23:59:59.000Z',
    venue: 'Global',
    participants: ['G7', 'AI', 'GPU', 'LAW', '+27 more'],
    thumbnail: 'G7',
    tone: 'blue',
    thesis:
      'Policy chatter and procurement delays point to higher odds than the market implies. The asymmetric edge is in a small YES position.',
    catalysts: ['G7 communique', 'Chipmaker lobbying notes', 'Commerce ministry calendar'],
    risks: ['Non-binding guidance', 'Delayed publication', 'Ambiguous resolution criteria'],
  },
]

export const agentSteps = [
  'Scout ranks active markets by liquidity, deadline pressure, and price movement.',
  'Analyst estimates fair probability from public signals and market microstructure.',
  'Buyer agent requests a locked report and receives an x402 payment requirement.',
  'Settlement agent commits the report hash and signal metadata to Arc.',
]

export const reportPrice = '$0.04-$2.00 USDC'
