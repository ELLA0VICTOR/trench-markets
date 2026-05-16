import type { FormEvent } from 'react'
import { formatPercent, formatUsd } from '../lib/format'
import { signalFor } from '../lib/marketMath'
import type { Market } from '../types/market'

type MarketRailProps = {
  markets: Market[]
  selectedMarket: Market
  customQuestion: string
  onCustomQuestionChange: (question: string) => void
  onCustomMarketSubmit: (event: FormEvent<HTMLFormElement>) => void
  onMarketSelect: (id: string) => void
}

export function MarketRail({
  markets,
  selectedMarket,
  customQuestion,
  onCustomQuestionChange,
  onCustomMarketSubmit,
  onMarketSelect,
}: MarketRailProps) {
  return (
    <aside className="market-rail" id="markets">
      <div className="rail-header">
        <span>01</span>
        <h2>Scout Feed</h2>
      </div>

      <form className="custom-market" onSubmit={onCustomMarketSubmit}>
        <label htmlFor="custom-question">Custom market</label>
        <textarea
          id="custom-question"
          value={customQuestion}
          onChange={(event) => onCustomQuestionChange(event.target.value)}
          placeholder="Will Circle announce a new Arc developer primitive before demo day?"
          rows={4}
        />
        <button type="submit">Price market</button>
      </form>

      <div className="market-list">
        {markets.map((market) => {
          const active = market.id === selectedMarket.id
          const marketSignal = signalFor(market.price, market.fairPrice)

          return (
            <button
              className={active ? 'market-row is-active' : 'market-row'}
              type="button"
              onClick={() => onMarketSelect(market.id)}
              key={market.id}
            >
              <span className="market-row-top">
                <span>{market.category}</span>
                <strong>{marketSignal}</strong>
              </span>
              <span className="market-title">{market.title}</span>
              <span className="market-meta">
                <span>{formatUsd(market.volume24h)} 24h</span>
                <span>{formatPercent(market.price)} implied</span>
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
