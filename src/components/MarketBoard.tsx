import { MarketCard } from './MarketCard'
import type { FeedState, Market } from '../types/market'

type MarketBoardProps = {
  markets: Market[]
  selectedMarket: Market
  feedState: FeedState
  onMarketSelect: (id: string) => void
  onCreateClick: () => void
}

function feedCopy(feedState: FeedState) {
  if (feedState === 'live') {
    return 'Live Polymarket Gamma feed'
  }

  if (feedState === 'syncing') {
    return 'Syncing market feed'
  }

  return 'Seed feed active'
}

export function MarketBoard({
  markets,
  selectedMarket,
  feedState,
  onMarketSelect,
  onCreateClick,
}: MarketBoardProps) {
  return (
    <section className="market-board" aria-label="Prediction markets">
      <div className="board-header">
        <div>
          <span>Markets</span>
          <h1>Markets</h1>
        </div>
        <div className="board-actions">
          <div className="feed-chip">{feedCopy(feedState)}</div>
          <button className="create-button" type="button" onClick={onCreateClick}>
            Create market
          </button>
        </div>
      </div>

      {markets.length > 0 ? (
        <div className="market-grid">
          {markets.map((market) => (
            <MarketCard
              market={market}
              active={market.id === selectedMarket.id}
              onSelect={onMarketSelect}
              key={market.id}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No markets found</h2>
          <p>Try a different search term or create a custom market for the agent.</p>
        </div>
      )}
    </section>
  )
}
