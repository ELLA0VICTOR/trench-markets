import type { Signal } from './market'

export type AgentRun = {
  agent: 'Scout Agent' | 'Analyst Agent' | 'Buyer Agent' | 'Arc Proof Agent'
  status: 'live' | 'simulated' | 'queued'
  summary: string
  artifact?: string
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
