import { reportPrice } from '../data/markets'
import { formatPercent } from '../lib/format'
import { confidenceFor, edgeLabel } from '../lib/marketMath'
import type { Market, PaymentState, Signal } from '../types/market'
import { MiniIcon } from './MiniIcon'

type AgentDeskProps = {
  market: Market
  paymentState: PaymentState
  signal: Signal
  reportHash: string
  txHash: string
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

export function AgentDesk({
  market,
  paymentState,
  signal,
  reportHash,
  txHash,
  onReportRequest,
  onSettleReport,
  onSignalPublish,
}: AgentDeskProps) {
  const confidence = confidenceFor(market.price, market.fairPrice, market.liquidity)
  const unlocked = paymentState === 'paid' || paymentState === 'published'

  return (
    <aside className="agent-desk" aria-label="Agent market desk">
      <div className="desk-card desk-card-main">
        <div className="desk-card-heading">
          <span>Agent signal</span>
          <strong>{signal}</strong>
        </div>
        <h2>{market.title}</h2>
        <div className="desk-metrics">
          <div>
            <span>Market</span>
            <strong>{formatPercent(market.price)}</strong>
          </div>
          <div>
            <span>Agent fair</span>
            <strong>{formatPercent(market.fairPrice)}</strong>
          </div>
          <div>
            <span>Edge</span>
            <strong>{edgeLabel(market.price, market.fairPrice)}</strong>
          </div>
          <div>
            <span>Confidence</span>
            <strong>{formatPercent(confidence)}</strong>
          </div>
        </div>
      </div>

      <div className="desk-card">
        <div className="desk-card-heading">
          <span>x402 payment</span>
          <strong>{paymentState === 'quote' ? 'quote' : '402'}</strong>
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
        <p className="desk-copy">{paymentCopy(paymentState)}</p>
        <div className="desk-actions">
          <button type="button" onClick={onReportRequest} disabled={paymentState !== 'quote'}>
            Request report
          </button>
          <button type="button" onClick={onSettleReport} disabled={paymentState !== 'required'}>
            Pay via x402
          </button>
          <button type="button" onClick={onSignalPublish} disabled={paymentState !== 'paid'}>
            Publish signal
          </button>
        </div>
      </div>

      <div className="desk-card">
        <div className="desk-card-heading">
          <span>Report</span>
          <strong>{unlocked ? 'unlocked' : 'locked'}</strong>
        </div>
        <p className="desk-copy">
          {unlocked
            ? market.thesis
            : 'The reasoning packet stays locked until the buyer agent satisfies the x402 challenge.'}
        </p>
        <div className="mini-list">
          <div>
            <span>Catalysts</span>
            <p>{market.catalysts.join(' / ')}</p>
          </div>
          <div>
            <span>Risks</span>
            <p>{market.risks.join(' / ')}</p>
          </div>
        </div>
      </div>

      <div className="desk-card proof-card">
        <div className="desk-card-heading">
          <span>Arc proof</span>
          <strong>{paymentState === 'published' ? 'committed' : 'pending'}</strong>
        </div>
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
  )
}
