import type { AgentReport } from '../types.js'

const reports = new Map<string, AgentReport>()

export function getReport(marketId: string) {
  return reports.get(marketId)
}

export function saveReport(report: AgentReport) {
  reports.set(report.marketId, report)
  return report
}
