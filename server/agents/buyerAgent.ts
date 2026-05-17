import type { AgentReport } from '../types.js'

export function requestLockedReport(report: AgentReport) {
  return {
    ...report,
    locked: true,
    runs: [
      ...report.runs,
      {
        agent: 'Buyer Agent' as const,
        status: 'queued' as const,
        summary: 'Requested report artifact and received an x402 payment challenge.',
        artifact: `${report.challenge.amount} ${report.challenge.asset} on ${report.challenge.network}`,
      },
    ],
  }
}

type SettlementArtifact = {
  transaction?: string
  payer?: string
  network?: string
}

export function settleX402Challenge(report: AgentReport, settlement?: SettlementArtifact) {
  const settledViaGateway = Boolean(settlement?.transaction)

  return {
    ...report,
    locked: false,
    runs: [
      ...report.runs,
      {
        agent: 'Buyer Agent' as const,
        status: settledViaGateway ? ('live' as const) : ('simulated' as const),
        summary: settledViaGateway
          ? `Settled the x402 challenge through Circle Gateway on ${settlement?.network}.`
          : 'Attached a local payment receipt. This becomes a real Circle x402 retry once credentials are configured.',
        artifact: settlement?.transaction || report.challenge.reportHash,
      },
    ],
  }
}
