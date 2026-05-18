import { useState } from 'react'
import { reportPrice } from '../data/markets'
import { arcExplorerTxUrl } from '../lib/explorer'
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
  onSettleReport: (mode: 'buyer' | 'sponsored') => boolean | Promise<boolean>
  onSignalPublish: () => void
  onViewReport: () => void
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

  if (paymentState === 'publishing') {
    return 'Arc writer is committing the report hash to SignalRegistry.'
  }

  return 'Signal hash is committed to the Arc proof rail.'
}

function formatReceiver(receiver?: string) {
  if (!receiver) return 'analyst.trench'
  if (!/^0x[a-fA-F0-9]{40}$/.test(receiver)) return receiver

  return `${receiver.slice(0, 6)}...${receiver.slice(-4)}`
}

function shortHash(value: string) {
  if (!value) return 'not ready'
  if (value.length <= 18) return value

  return `${value.slice(0, 10)}...${value.slice(-6)}`
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
  onViewReport,
}: MarketDetailProps) {
  const confidence = agentReport?.confidence || confidenceFor(market.price, market.fairPrice, market.liquidity)
  const unlocked = paymentState === 'paid' || paymentState === 'publishing' || paymentState === 'published'
  const isPublished = paymentState === 'published'
  const isPublishing = paymentState === 'publishing'
  const fairPrice = agentReport?.fairPrice || market.fairPrice
  const challenge = agentReport?.challenge
  const reportPriceLabel = challenge ? `$${challenge.amount} ${challenge.asset}` : reportPrice
  const pricingRationale = challenge?.pricing.rationale.join(' / ')
  const lockedLabel = paymentState === 'settling' ? 'settling' : isPublishing ? 'publishing' : 'locked'
  const proofTxUrl = arcExplorerTxUrl(agentReport?.proof?.txHash)
  const [actionStep, setActionStep] = useState(0)
  const actionSteps = ['Quote', 'Payment', 'Proof']

  function stepBack() {
    setActionStep((step) => Math.max(0, step - 1))
  }

  function stepNext() {
    setActionStep((step) => Math.min(actionSteps.length - 1, step + 1))
  }

  function requestReportAndAdvance() {
    onReportRequest()
    setActionStep(1)
  }

  async function settleReportAndAdvance() {
    const settled = await onSettleReport(paymentMode)

    if (settled) {
      setActionStep(2)
    }
  }

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

        {unlocked ? (
          <section className="detail-section report-entry">
            <div className="detail-section-heading">
              <h2>Report ready</h2>
              <span>{isPublished ? 'published' : 'unlocked'}</span>
            </div>
            <p>Open the dedicated report page for signal, confidence, edge, execution guidance, evidence, and Arc proof.</p>
            <button className="secondary-action" type="button" onClick={onViewReport}>
              View report
            </button>
          </section>
        ) : null}
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

          <div className="action-stepper" aria-label="Report flow">
            {actionSteps.map((step, index) => (
              <button
                type="button"
                className={index === actionStep ? 'is-active' : ''}
                key={step}
                onClick={() => setActionStep(index)}
              >
                {step}
              </button>
            ))}
          </div>

          {actionStep === 0 ? (
            <div className="action-step">
              <div className="signal-grid">
                <div>
                  <span>Signal</span>
                  <strong>{unlocked ? signal : lockedLabel}</strong>
                </div>
                <div>
                  <span>Confidence</span>
                  <strong>{unlocked ? formatPercent(confidence) : lockedLabel}</strong>
                </div>
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
                <div className="pricing-note compact">
                  <span>Agent price</span>
                  <strong>Max ${challenge.pricing.maxAmount}</strong>
                  <p>{unlocked ? pricingRationale : 'Pricing rationale unlocks with the report.'}</p>
                </div>
              ) : null}

              <p className="action-copy">
                {paymentState === 'quote' ? reportStateCopy(reportState) : paymentCopy(paymentState)}
              </p>
              <button
                className="primary-action"
                type="button"
                onClick={requestReportAndAdvance}
                disabled={paymentState !== 'quote'}
              >
                Request report
              </button>
            </div>
          ) : null}

          {actionStep === 1 ? (
            <div className="action-step">
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

              <p className="action-copy">{paymentCopy(paymentState)}</p>

              <div className="faucet-row">
                <span>Need Arc faucet?</span>
                <a href="https://faucet.circle.com/?allow=true" target="_blank" rel="noreferrer">
                  Get faucet
                </a>
              </div>

              {paymentError ? <p className="payment-error">{paymentError}</p> : null}

              <button
                className="primary-action"
                type="button"
                onClick={settleReportAndAdvance}
                disabled={paymentState !== 'required'}
              >
                {paymentMode === 'buyer' ? 'Pay from buyer wallet' : 'Run sponsored demo'}
              </button>
            </div>
          ) : null}

          {actionStep === 2 ? (
            <div className="action-step">
              <div className="proof-mini">
                <div>
                  <span>Report hash</span>
                  <strong title={reportHash}>{shortHash(reportHash)}</strong>
                </div>
                <div>
                  <span>{agentReport?.proof?.txHash ? 'Tx hash' : 'Proof status'}</span>
                  <strong title={proofLabel}>
                    {isPublished ? shortHash(proofLabel) : isPublishing ? 'publishing' : 'not published'}
                  </strong>
                </div>
                {agentReport?.proof?.contractAddress ? (
                  <div>
                    <span>Contract</span>
                    <strong title={agentReport.proof.contractAddress}>
                      {shortHash(agentReport.proof.contractAddress)}
                    </strong>
                  </div>
                ) : null}
                {agentReport?.proof?.blockNumber ? (
                  <div>
                    <span>Block</span>
                    <strong>{agentReport.proof.blockNumber}</strong>
                  </div>
                ) : null}
              </div>

              <p className="action-copy">{paymentCopy(paymentState)}</p>
              {paymentError ? <p className="payment-error">{paymentError}</p> : null}
              {isPublished && proofTxUrl ? (
                <a
                  className="proof-link"
                  href={proofTxUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Arc transaction <span aria-hidden="true">↗</span>
                </a>
              ) : null}
              <button
                className="primary-action"
                type="button"
                onClick={onSignalPublish}
                disabled={paymentState !== 'paid'}
              >
                {isPublished ? 'Published to Arc' : isPublishing ? 'Publishing...' : 'Publish to Arc'}
              </button>
              {unlocked ? (
                <button className="secondary-action" type="button" onClick={onViewReport}>
                  View report
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="action-nav">
            <button type="button" onClick={stepBack} disabled={actionStep === 0}>
              Previous
            </button>
            <span>
              {actionStep + 1} / {actionSteps.length}
            </span>
            <button type="button" onClick={stepNext} disabled={actionStep === actionSteps.length - 1}>
              Next
            </button>
          </div>
        </div>
      </aside>
    </main>
  )
}
