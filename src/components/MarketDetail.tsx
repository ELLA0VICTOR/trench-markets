import { reportPrice } from '../data/markets'
import { formatDate, formatPercent, formatUsd } from '../lib/format'
import { confidenceFor, edgeLabel } from '../lib/marketMath'
import type { Market, PaymentState, Signal } from '../types/market'
import type { AgentReport } from '../types/report'
import { MiniIcon } from './MiniIcon'

type MarketDetailProps = {
  market: Market
  paymentState: PaymentState
  reportState: 'idle' | 'loading' | 'ready' | 'offline'
  agentReport?: AgentReport
  signal: Signal
  reportHash: string
  proofLabel: string
  paymentMode: 'buyer' | 'sponsored'
  paymentError?: string
  onBack: () => void
  onReportRequest: () => void
  onPaymentModeChange: (mode: 'buyer' | 'sponsored') => void
  onSettleReport: (mode: 'buyer' | 'sponsored') => void
  onSignalPublish: () => void
}

function paymentCopy(paymentState: PaymentState) {
  if (paymentState === 'quote') {
    return 'Buyer agent can request the locked report artifact.'
  }

  if (paymentState === 'required') {
    return 'HTTP 402 issued. Buyer wallet signs the Gateway authorization and pays the seller.'
  }

  if (paymentState === 'settling') {
    return 'Payment proof is being attached to the retry request.'
  }

  if (paymentState === 'paid') {
    return 'Full report is unlocked and ready to publish.'
  }

  return 'Signal hash is committed to the Arc proof rail.'
}

function formatReceiver(receiver?: string) {
  if (!receiver) return 'analyst.trench'
  if (!/^0x[a-fA-F0-9]{40}$/.test(receiver)) return receiver

  return `${receiver.slice(0, 6)}...${receiver.slice(-4)}`
}

function reportStateCopy(reportState: MarketDetailProps['reportState']) {
  if (reportState === 'loading') {
    return 'Analyst agent is preparing the locked report.'
  }

  if (reportState === 'offline') {
    return 'Local fallback is active because the agent API is offline.'
  }

  return 'Buyer agent can request the locked report artifact.'
}

function formatDelta(value: number) {
  const points = Math.round(value * 100)

  return points > 0 ? `+${points} pts` : `${points} pts`
}

function evidenceQualityLabel(value: number) {
  if (value >= 0.72) return 'high'
  if (value >= 0.52) return 'medium'
  return 'thin'
}

function formatScore(value: number) {
  return `${Math.round(value * 100)}%`
}

function labelize(value: string) {
  return value.replace(/-/g, ' ')
}

function DetailHeroImage({ market }: { market: Market }) {
  if (market.imageUrl) {
    return <img src={market.imageUrl} alt="" referrerPolicy="no-referrer" />
  }

  return (
    <div className={`detail-fallback tone-${market.tone}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <strong>{market.thumbnail}</strong>
    </div>
  )
}

export function MarketDetail({
  market,
  paymentState,
  reportState,
  agentReport,
  signal,
  reportHash,
  proofLabel,
  paymentMode,
  paymentError,
  onBack,
  onReportRequest,
  onPaymentModeChange,
  onSettleReport,
  onSignalPublish,
}: MarketDetailProps) {
  const confidence = agentReport?.confidence || confidenceFor(market.price, market.fairPrice, market.liquidity)
  const unlocked = paymentState === 'paid' || paymentState === 'published'
  const fairPrice = agentReport?.fairPrice || market.fairPrice
  const reportThesis = agentReport?.thesis || market.thesis
  const catalysts = agentReport?.catalysts || market.catalysts
  const risks = agentReport?.risks || market.risks
  const challenge = agentReport?.challenge
  const runs = agentReport?.runs || []
  const reportPriceLabel = challenge ? `$${challenge.amount} ${challenge.asset}` : reportPrice
  const pricingRationale = challenge?.pricing.rationale.join(' / ')
  const lockedLabel = paymentState === 'settling' ? 'settling' : 'locked'
  const evidence = agentReport?.evidence

  return (
    <main className="detail-layout">
      <section className="detail-main">
        <button className="back-button" type="button" onClick={onBack}>
          Back to markets
        </button>

        <section className="detail-hero">
          <DetailHeroImage market={market} />
          <div className="detail-copy">
            <div className="detail-tags">
              <span>{market.category}</span>
              <strong>{market.status}</strong>
            </div>
            <h1>{market.title}</h1>
            <p>By trench-markets</p>
          </div>
        </section>

        <section className="detail-stats" aria-label="Market stats">
          <div>
            <span>Volume</span>
            <strong>{formatUsd(market.volume24h)}</strong>
          </div>
          <div>
            <span>Market</span>
            <strong>{formatPercent(market.price)}</strong>
          </div>
          <div>
            <span>Agent fair</span>
            <strong>{unlocked ? formatPercent(fairPrice) : lockedLabel}</strong>
          </div>
          <div>
            <span>Ends</span>
            <strong>{formatDate(market.endDate)}</strong>
          </div>
        </section>

        <section className="detail-section">
          <div className="detail-section-heading">
            <h2>More about this market</h2>
            <span>{unlocked ? `${edgeLabel(market.price, market.fairPrice)} edge` : 'agent edge locked'}</span>
          </div>
          <p>
            {market.description ||
              'This market is being watched by Trench for probability drift, liquidity changes, and agent-to-agent report demand.'}
          </p>
        </section>

        <section className="detail-section">
          <div className="detail-section-heading">
            <h2>Agent report</h2>
            <span>{reportState === 'loading' ? 'syncing' : unlocked ? 'unlocked' : 'locked'}</span>
          </div>
          <p>
            {unlocked
              ? reportThesis
              : 'The reasoning packet stays locked until the buyer agent satisfies the x402 challenge.'}
          </p>
          <div className="report-grid">
            <div>
              <span>Catalysts</span>
              <p>{unlocked ? catalysts.join(' / ') : 'Locked inside the paid report.'}</p>
            </div>
            <div>
              <span>Risks</span>
              <p>{unlocked ? risks.join(' / ') : 'Locked inside the paid report.'}</p>
            </div>
          </div>
          {unlocked && runs.length > 0 ? (
            <div className="agent-run-list" aria-label="Agent runs">
              {runs.map((run, index) => (
                <div key={`${run.agent}-${index}`}>
                  <span>{run.agent}</span>
                  <strong>{run.status}</strong>
                  <p>{run.summary}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="detail-section">
          <div className="detail-section-heading">
            <h2>Evidence engine</h2>
            <span>{unlocked && evidence ? evidence.verdict : 'locked'}</span>
          </div>
          <p>
            {unlocked && evidence
              ? evidence.summary
              : 'External evidence, source scoring, skeptic notes, and entry guidance unlock after x402 payment.'}
          </p>

          {unlocked && evidence ? (
            <>
              <div className="evidence-metrics" aria-label="Evidence forecast">
                <div>
                  <span>Prior</span>
                  <strong>{formatPercent(evidence.forecast.prior)}</strong>
                </div>
                <div>
                  <span>Evidence</span>
                  <strong>{formatDelta(evidence.forecast.evidenceDelta)}</strong>
                </div>
                <div>
                  <span>Fair</span>
                  <strong>{formatPercent(evidence.forecast.fairPrice)}</strong>
                </div>
                <div>
                  <span>Quality</span>
                  <strong>{evidenceQualityLabel(evidence.forecast.evidenceQuality)}</strong>
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
                  <span>Contradiction</span>
                  <strong>{formatScore(evidence.diagnostics.contradictionScore)}</strong>
                </div>
                <div>
                  <span>Official</span>
                  <strong>{formatScore(evidence.forecast.officialCoverage)}</strong>
                </div>
              </div>

              <div className="evidence-list" aria-label="Evidence sources">
                {evidence.items.slice(0, 5).map((item) => (
                  <a
                    className="evidence-item"
                    href={item.url || undefined}
                    target={item.url ? '_blank' : undefined}
                    rel="noreferrer"
                    key={`${item.source}-${item.title}`}
                  >
                    <div>
                      <span>{item.source}</span>
                      <strong>{item.title}</strong>
                    </div>
                    <small>{item.stance.replace('-', ' ')}</small>
                  </a>
                ))}
              </div>

              <div className="report-grid">
                <div>
                  <span>Research plan</span>
                  <p>
                    {evidence.plan.eventType} / {evidence.plan.queries.join(' / ')}
                  </p>
                </div>
                <div>
                  <span>Base rate</span>
                  <p>{evidence.forecast.baseRate}</p>
                </div>
                <div>
                  <span>Official sources</span>
                  <p>
                    {evidence.officialSources.length > 0
                      ? evidence.officialSources
                          .map((source) => `${source.label} (${source.status})`)
                          .join(' / ')
                      : 'No primary-source target matched this market.'}
                  </p>
                </div>
                <div>
                  <span>Monitoring</span>
                  <p>{evidence.monitoring.map((item) => `${item.trigger}: ${item.reason}`).join(' / ')}</p>
                </div>
                <div>
                  <span>Entry</span>
                  <p>
                    {evidence.recommendation.maxEntry} / {evidence.recommendation.positionSize}
                  </p>
                </div>
                <div>
                  <span>Diagnostics</span>
                  <p>
                    {evidence.diagnostics.deadlinePressure} deadline / {evidence.diagnostics.manipulationRisk}{' '}
                    manipulation risk / {formatScore(evidence.diagnostics.sourceDiversity)} diversity
                  </p>
                </div>
                <div>
                  <span>Skeptic</span>
                  <p>{evidence.skeptic.join(' / ')}</p>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </section>

      <aside className="detail-action">
        <div className="action-card">
          <div className="action-market">
            <DetailHeroImage market={market} />
            <div>
              <span>{market.title}</span>
              <h2>Unlock agent signal</h2>
            </div>
          </div>

          <div className="action-tabs">
            <button type="button" className="is-active">
              x402
            </button>
            <button type="button">Arc proof</button>
          </div>

          <div className="signal-row">
            <span>Signal</span>
            <strong>{unlocked ? signal : lockedLabel}</strong>
          </div>
          <div className="signal-row">
            <span>Confidence</span>
            <strong>{unlocked ? formatPercent(confidence) : lockedLabel}</strong>
          </div>

          <div className="relay-stack compact">
            <div className="relay-line">
              <MiniIcon type="signal" />
              <div>
                <span>Seller</span>
                <strong>{formatReceiver(challenge?.receiver)}</strong>
              </div>
            </div>
            <div className="relay-line">
              <MiniIcon type="pay" />
              <div>
                <span>Price</span>
                <strong>{reportPriceLabel}</strong>
              </div>
            </div>
          </div>

          {challenge?.pricing ? (
            <div className="pricing-note">
              <span>Agent price</span>
              <strong>Max ${challenge.pricing.maxAmount}</strong>
              <p>{unlocked ? pricingRationale : 'Pricing rationale unlocks with the report.'}</p>
            </div>
          ) : null}

          <p className="action-copy">
            {paymentState === 'quote' ? reportStateCopy(reportState) : paymentCopy(paymentState)}
          </p>

          <div className="payment-mode" aria-label="Payment mode">
            <button
              type="button"
              className={paymentMode === 'buyer' ? 'is-active' : ''}
              onClick={() => onPaymentModeChange('buyer')}
              disabled={paymentState === 'settling'}
            >
              Buyer wallet
            </button>
            <button
              type="button"
              className={paymentMode === 'sponsored' ? 'is-active' : ''}
              onClick={() => onPaymentModeChange('sponsored')}
              disabled={paymentState === 'settling'}
            >
              Sponsored demo
            </button>
          </div>

          <div className="faucet-row">
            <span>Need Arc faucet?</span>
            <a href="https://faucet.circle.com/?allow=true" target="_blank" rel="noreferrer">
              Get faucet
            </a>
          </div>

          {paymentError ? <p className="payment-error">{paymentError}</p> : null}

          <div className="action-buttons">
            <button type="button" onClick={onReportRequest} disabled={paymentState !== 'quote'}>
              Request report
            </button>
            <button type="button" onClick={() => onSettleReport(paymentMode)} disabled={paymentState !== 'required'}>
              {paymentMode === 'buyer' ? 'Pay from buyer wallet' : 'Run sponsored demo'}
            </button>
            <button type="button" onClick={onSignalPublish} disabled={paymentState !== 'paid'}>
              Publish to Arc
            </button>
          </div>
        </div>

        <div className="proof-summary">
          <span>Arc proof</span>
          <dl>
            <div>
              <dt>Report hash</dt>
              <dd>{reportHash}</dd>
            </div>
            <div>
              <dt>{agentReport?.proof?.txHash ? 'Tx hash' : 'Proof status'}</dt>
              <dd>{paymentState === 'published' ? proofLabel : 'not published'}</dd>
            </div>
            {agentReport?.proof?.contractAddress ? (
              <div>
                <dt>Contract</dt>
                <dd>{agentReport.proof.contractAddress}</dd>
              </div>
            ) : null}
            {agentReport?.proof?.blockNumber ? (
              <div>
                <dt>Block</dt>
                <dd>{agentReport.proof.blockNumber}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </aside>
    </main>
  )
}
