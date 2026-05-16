import { reportPrice } from '../data/markets'
import { formatDate, formatPercent, formatUsd } from '../lib/format'
import { confidenceFor, edgeLabel } from '../lib/marketMath'
import type { Market, PaymentState, Signal } from '../types/market'
import { MiniIcon } from './MiniIcon'

type MarketDetailProps = {
  market: Market
  paymentState: PaymentState
  signal: Signal
  reportHash: string
  txHash: string
  onBack: () => void
  onReportRequest: () => void
  onSettleReport: () => void
  onSignalPublish: () => void
}

function paymentCopy(paymentState: PaymentState) {
  if (paymentState === 'quote') {
    return 'Buyer agent can request the locked report artifact.'
  }

  if (paymentState === 'required') {
    return 'HTTP 402 issued with amount, receiver, asset, and report hash.'
  }

  if (paymentState === 'settling') {
    return 'Payment proof is being attached to the retry request.'
  }

  if (paymentState === 'paid') {
    return 'Full report is unlocked and ready to publish.'
  }

  return 'Signal hash is committed to the Arc proof rail.'
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
  signal,
  reportHash,
  txHash,
  onBack,
  onReportRequest,
  onSettleReport,
  onSignalPublish,
}: MarketDetailProps) {
  const confidence = confidenceFor(market.price, market.fairPrice, market.liquidity)
  const unlocked = paymentState === 'paid' || paymentState === 'published'

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
            <p>By {market.source}</p>
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
            <strong>{formatPercent(market.fairPrice)}</strong>
          </div>
          <div>
            <span>Ends</span>
            <strong>{formatDate(market.endDate)}</strong>
          </div>
        </section>

        <section className="detail-section">
          <div className="detail-section-heading">
            <h2>More about this market</h2>
            <span>{edgeLabel(market.price, market.fairPrice)} edge</span>
          </div>
          <p>
            {market.description ||
              'This market is being watched by Trench for probability drift, liquidity changes, and agent-to-agent report demand.'}
          </p>
        </section>

        <section className="detail-section">
          <div className="detail-section-heading">
            <h2>Agent report</h2>
            <span>{unlocked ? 'unlocked' : 'locked'}</span>
          </div>
          <p>
            {unlocked
              ? market.thesis
              : 'The reasoning packet stays locked until the buyer agent satisfies the x402 challenge.'}
          </p>
          <div className="report-grid">
            <div>
              <span>Catalysts</span>
              <p>{market.catalysts.join(' / ')}</p>
            </div>
            <div>
              <span>Risks</span>
              <p>{market.risks.join(' / ')}</p>
            </div>
          </div>
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
            <strong>{signal}</strong>
          </div>
          <div className="signal-row">
            <span>Confidence</span>
            <strong>{formatPercent(confidence)}</strong>
          </div>

          <div className="relay-stack compact">
            <div className="relay-line">
              <MiniIcon type="signal" />
              <div>
                <span>Seller</span>
                <strong>analyst.trench</strong>
              </div>
            </div>
            <div className="relay-line">
              <MiniIcon type="pay" />
              <div>
                <span>Price</span>
                <strong>{reportPrice}</strong>
              </div>
            </div>
          </div>

          <p className="action-copy">{paymentCopy(paymentState)}</p>

          <div className="action-buttons">
            <button type="button" onClick={onReportRequest} disabled={paymentState !== 'quote'}>
              Request report
            </button>
            <button type="button" onClick={onSettleReport} disabled={paymentState !== 'required'}>
              Pay via x402
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
              <dt>Tx hash</dt>
              <dd>{paymentState === 'published' ? txHash : 'not published'}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </main>
  )
}
