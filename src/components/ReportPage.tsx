import { arcExplorerTxUrl } from '../lib/explorer'
import { formatDate, formatPercent, formatUsd } from '../lib/format'
import { edgeLabel } from '../lib/marketMath'
import type { Market, PaymentState, Signal } from '../types/market'
import type { AgentReport } from '../types/report'

type ReportPageProps = {
  market: Market
  report?: AgentReport
  paymentState: PaymentState
  signal: Signal
  onBackToMarket: () => void
}

function shortHash(value?: string) {
  if (!value) return 'pending'
  if (value.length <= 18) return value

  return `${value.slice(0, 10)}...${value.slice(-6)}`
}

function formatDelta(value: number) {
  const points = Math.round(value * 100)

  return points > 0 ? `+${points} pts` : `${points} pts`
}

function formatScore(value: number) {
  return `${Math.round(value * 100)}%`
}

function labelize(value: string) {
  return value.replace(/-/g, ' ')
}

function proofStatus(report?: AgentReport) {
  if (report?.proof?.status === 'published') return 'published'
  if (report?.proof?.status === 'queued') return 'queued'

  return 'not published'
}

export function ReportPage({ market, report, paymentState, signal, onBackToMarket }: ReportPageProps) {
  const unlocked = Boolean(report && !report.locked && (paymentState === 'paid' || paymentState === 'publishing' || paymentState === 'published'))
  const evidence = report?.evidence
  const recommendation = evidence?.recommendation
  const confidence = report?.confidence ?? 0
  const fairPrice = report?.fairPrice ?? market.fairPrice
  const marketPrice = report?.marketPrice ?? market.price
  const finalSignal = report?.signal || signal
  const proofTxUrl = arcExplorerTxUrl(report?.proof?.txHash)
  const proofReference = report?.proof?.txHash || report?.proof?.proofId

  return (
    <main className="report-page">
      <button className="back-button" type="button" onClick={onBackToMarket}>
        Back to market
      </button>

      <section className="report-header">
        <div>
          <span>Agent report</span>
          <h1>{market.title}</h1>
          <p>
            Version {report?.version || 1} / Report hash {shortHash(report?.reportHash)} / Proof {proofStatus(report)}
          </p>
        </div>
        <div className={`report-signal ${finalSignal.toLowerCase().replace(' ', '-')}`}>
          <span>Signal</span>
          <strong>{unlocked ? finalSignal : 'locked'}</strong>
        </div>
      </section>

      {!unlocked ? (
        <section className="report-locked">
          <h2>Report is not unlocked yet</h2>
          <p>Pay the x402 challenge from the market page to unlock the intelligence packet.</p>
        </section>
      ) : (
        <>
          <section className="report-metric-grid" aria-label="Decision summary">
            <div>
              <span>Confidence</span>
              <strong>{formatPercent(confidence)}</strong>
            </div>
            <div>
              <span>Market</span>
              <strong>{formatPercent(marketPrice)}</strong>
            </div>
            <div>
              <span>Agent fair</span>
              <strong>{formatPercent(fairPrice)}</strong>
            </div>
            <div>
              <span>Edge</span>
              <strong>{edgeLabel(marketPrice, fairPrice)}</strong>
            </div>
            <div>
              <span>Volume</span>
              <strong>{formatUsd(market.volume24h)}</strong>
            </div>
            <div>
              <span>Ends</span>
              <strong>{formatDate(market.endDate)}</strong>
            </div>
          </section>

          <section className="report-two-column">
            <div className="report-panel report-primary">
              <span>Decision brief</span>
              <h2>{report?.thesis}</h2>
              <p>{evidence?.summary || 'Evidence summary unavailable for this report.'}</p>
            </div>
            <div className="report-panel">
              <span>Execution guidance</span>
              <dl className="report-dl">
                <div>
                  <dt>Action</dt>
                  <dd>{recommendation?.action || finalSignal}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{recommendation?.positionSize || 'standard'}</dd>
                </div>
                <div>
                  <dt>Max entry</dt>
                  <dd>{recommendation?.maxEntry || formatPercent(fairPrice)}</dd>
                </div>
                <div>
                  <dt>Invalidation</dt>
                  <dd>{recommendation?.invalidation || 'New primary-source contradiction.'}</dd>
                </div>
              </dl>
            </div>
          </section>

          {evidence ? (
            <section className="report-panel">
              <div className="report-section-heading">
                <div>
                  <span>Evidence engine</span>
                  <h2>{evidence.verdict}</h2>
                </div>
                <strong>{evidence.version}</strong>
              </div>
              <div className="report-metric-grid compact">
                <div>
                  <span>Prior</span>
                  <strong>{formatPercent(evidence.forecast.prior)}</strong>
                </div>
                <div>
                  <span>Evidence</span>
                  <strong>{formatDelta(evidence.forecast.evidenceDelta)}</strong>
                </div>
                <div>
                  <span>Consensus</span>
                  <strong>{labelize(evidence.diagnostics.consensus)}</strong>
                </div>
                <div>
                  <span>Liquidity</span>
                  <strong>{evidence.diagnostics.liquidityGrade}</strong>
                </div>
                <div>
                  <span>Official</span>
                  <strong>{formatScore(evidence.forecast.officialCoverage)}</strong>
                </div>
                <div>
                  <span>Contradiction</span>
                  <strong>{formatScore(evidence.diagnostics.contradictionScore)}</strong>
                </div>
              </div>
            </section>
          ) : null}

          <section className="report-two-column">
            <div className="report-panel">
              <span>Catalysts</span>
              <ul className="report-list">
                {(report?.catalysts || market.catalysts).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="report-panel">
              <span>Risks</span>
              <ul className="report-list">
                {(report?.risks || market.risks).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>

          {evidence ? (
            <section className="report-panel">
              <div className="report-section-heading">
                <div>
                  <span>Sources</span>
                  <h2>Evidence used</h2>
                </div>
              </div>
              <div className="report-source-list">
                {evidence.items.slice(0, 6).map((item) => (
                  <a href={item.url || undefined} target={item.url ? '_blank' : undefined} rel="noreferrer" key={`${item.source}-${item.title}`}>
                    <div>
                      <span>{item.source}</span>
                      <strong>{item.title}</strong>
                      <p>{item.summary}</p>
                    </div>
                    <small>{item.stance.replace('-', ' ')}</small>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <section className="report-panel">
            <div className="report-section-heading">
              <div>
                <span>Arc proof</span>
                <h2>{proofStatus(report)}</h2>
              </div>
            </div>
            <dl className="report-dl proof">
              <div>
                <dt>{report?.proof?.txHash ? 'Tx hash' : 'Proof id'}</dt>
                <dd>
                  {proofTxUrl ? (
                    <a className="hash-link" href={proofTxUrl} target="_blank" rel="noreferrer">
                      {shortHash(report?.proof?.txHash)}
                      <span aria-hidden="true">↗</span>
                    </a>
                  ) : (
                    shortHash(proofReference)
                  )}
                </dd>
              </div>
              <div>
                <dt>Contract</dt>
                <dd>{shortHash(report?.proof?.contractAddress)}</dd>
              </div>
              <div>
                <dt>Block</dt>
                <dd>{report?.proof?.blockNumber || (report?.proof?.status === 'published' ? 'already committed' : 'pending')}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </main>
  )
}
