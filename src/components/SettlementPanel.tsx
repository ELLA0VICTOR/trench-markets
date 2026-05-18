import { reportPrice } from '../data/markets'
import { formatDate } from '../lib/format'
import type { Market, PaymentState } from '../types/market'
import { MiniIcon } from './MiniIcon'

type SettlementPanelProps = {
  market: Market
  paymentState: PaymentState
  reportHash: string
  txHash: string
  onReportRequest: () => void
  onSettleReport: () => void
  onSignalPublish: () => void
}

function responseLabel(paymentState: PaymentState) {
  return paymentState === 'quote' ? '200 quote' : '402 payment required'
}

function paymentDescription(paymentState: PaymentState) {
  if (paymentState === 'quote') {
    return 'Report is priced. Buyer agent can request the locked artifact.'
  }

  if (paymentState === 'required') {
    return 'x402 challenge issued with amount, asset, receiver, and report hash.'
  }

  if (paymentState === 'settling') {
    return 'Buyer agent is attaching payment proof and retrying the request.'
  }

  if (paymentState === 'publishing') {
    return 'Arc writer is committing the signal proof.'
  }

  if (paymentState === 'published') {
    return 'Signal hash is committed to the Arc proof rail.'
  }

  return 'Paid report unlocked. Signal can be committed to Arc.'
}

export function SettlementPanel({
  market,
  paymentState,
  reportHash,
  txHash,
  onReportRequest,
  onSettleReport,
  onSignalPublish,
}: SettlementPanelProps) {
  return (
    <aside className="settlement-panel" id="settlement">
      <div className="rail-header">
        <span>03</span>
        <h2>x402 Relay</h2>
      </div>

      <div className="relay-stack">
        <div className="relay-line">
          <MiniIcon type="signal" />
          <div>
            <span>Seller agent</span>
            <strong>analyst.trench</strong>
          </div>
        </div>
        <div className="relay-line">
          <MiniIcon type="pay" />
          <div>
            <span>Payment request</span>
            <strong>{paymentState === 'quote' ? 'quote ready' : reportPrice}</strong>
          </div>
        </div>
        <div className="relay-line">
          <MiniIcon type="arc" />
          <div>
            <span>Settlement rail</span>
            <strong>Arc / USDC</strong>
          </div>
        </div>
      </div>

      <div className="payment-box">
        <span>HTTP response</span>
        <strong>{responseLabel(paymentState)}</strong>
        <p>{paymentDescription(paymentState)}</p>
      </div>

      <div className="button-stack">
        <button type="button" onClick={onReportRequest} disabled={paymentState !== 'quote'}>
          Request report
        </button>
        <button type="button" onClick={onSettleReport} disabled={paymentState !== 'required'}>
          Pay via x402
        </button>
        <button type="button" onClick={onSignalPublish} disabled={paymentState !== 'paid'}>
          {paymentState === 'published' ? 'Published' : paymentState === 'publishing' ? 'Publishing' : 'Publish signal'}
        </button>
      </div>

      <div className="proof-box" id="proof">
        <div className="proof-heading">
          <span>Arc proof</span>
          <strong>{paymentState === 'published' ? 'committed' : paymentState === 'publishing' ? 'publishing' : 'pending'}</strong>
        </div>
        <dl>
          <div>
            <dt>Report hash</dt>
            <dd>{reportHash}</dd>
          </div>
          <div>
            <dt>Tx hash</dt>
            <dd>{paymentState === 'published' ? txHash : paymentState === 'publishing' ? 'publishing' : 'not published'}</dd>
          </div>
          <div>
            <dt>Expiry</dt>
            <dd>{formatDate(market.endDate)}</dd>
          </div>
        </dl>
      </div>
    </aside>
  )
}
