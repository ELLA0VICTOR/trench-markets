import { formatPercent } from '../lib/format'
import { confidenceFor, edgeLabel } from '../lib/marketMath'
import type { Market, PaymentState, Signal } from '../types/market'

type AnalysisPanelProps = {
  market: Market
  paymentState: PaymentState
  signal: Signal
}

export function AnalysisPanel({ market, paymentState, signal }: AnalysisPanelProps) {
  const confidence = confidenceFor(market.price, market.fairPrice, market.liquidity)

  return (
    <section className="analysis-panel" id="agents">
      <div className="panel-heading">
        <div>
          <span>02</span>
          <h2>Analyst Signal</h2>
        </div>
        <div className={`signal-badge ${signal.toLowerCase().replace(' ', '-')}`}>
          {signal}
        </div>
      </div>

      <div className="market-detail">
        <span>{market.source}</span>
        <h3>{market.title}</h3>
        <div className="detail-grid">
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

      <div className="probability-band" aria-label="Probability comparison">
        <span className="band-tick tick-25" />
        <span className="band-tick tick-50" />
        <span className="band-tick tick-75" />
        <div className="market-marker" style={{ left: `${market.price * 100}%` }} />
        <div className="fair-marker" style={{ left: `${market.fairPrice * 100}%` }} />
      </div>
      <div className="band-labels">
        <span>0%</span>
        <span>market</span>
        <span>agent</span>
        <span>100%</span>
      </div>

      <div className="thesis-block">
        <h4>Unlocked brief</h4>
        <p>
          {paymentState === 'paid' || paymentState === 'published'
            ? market.thesis
            : 'Brief locked. Buyer agent must settle the x402 request before receiving the full rationale packet.'}
        </p>
      </div>

      <div className="agent-columns">
        <div>
          <h4>Catalysts</h4>
          <ul>
            {market.catalysts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Risks</h4>
          <ul>
            {market.risks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
