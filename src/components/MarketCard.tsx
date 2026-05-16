import { formatPercent, formatTimeLeft, formatUsd } from '../lib/format'
import { signalFor } from '../lib/marketMath'
import type { Market } from '../types/market'

type MarketCardProps = {
  market: Market
  active: boolean
  onSelect: (id: string) => void
}

function MarketIcon({ market }: { market: Market }) {
  if (market.imageUrl) {
    return (
      <img
        className="market-image"
        src={market.imageUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div className="market-fallback-visual" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <strong>{market.thumbnail}</strong>
    </div>
  )
}

function MarketThumb({ market }: { market: Market }) {
  if (market.imageUrl) {
    return <img src={market.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
  }

  return (
    <div className={`participant-thumb tone-${market.tone}`} aria-hidden="true">
      {market.thumbnail}
    </div>
  )
}

function ParticipantStack({
  participants,
  market,
}: {
  participants: string[]
  market: Market
}) {
  const visible = participants.slice(0, 5)
  const overflow = participants.find((participant) => participant.includes('more'))

  return (
    <div className="participant-row">
      <div className="participant-stack" aria-hidden="true">
        <span className="participant participant-image">
          <MarketThumb market={market} />
        </span>
        {visible.map((participant, index) => (
          <span
            className={`participant participant-${index + 1}`}
            key={`${participant}-${index}`}
          >
            {participant.replace('+', '').slice(0, 2)}
          </span>
        ))}
      </div>
      {overflow ? <span className="participant-overflow">{overflow}</span> : null}
    </div>
  )
}

export function MarketCard({ market, active, onSelect }: MarketCardProps) {
  const signal = signalFor(market.price, market.fairPrice)

  return (
    <button
      className={active ? 'market-card is-active' : 'market-card'}
      type="button"
      onClick={() => onSelect(market.id)}
    >
      <div className="market-card-tags">
        <span>{market.source === 'Polymarket Gamma' ? 'Polymarket' : 'Trench'}</span>
        <strong>{market.status}</strong>
      </div>

      <div className={`market-card-body tone-${market.tone}`}>
        <MarketIcon market={market} />
        <h3>{market.title}</h3>
        <ParticipantStack participants={market.participants} market={market} />
      </div>

      <div className="market-card-footer">
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 12a4 4 0 0 1 4-4h2" />
            <path d="M16 12a4 4 0 0 1-4 4h-2" />
            <path d="M14 8h2a4 4 0 0 1 0 8h-2" />
            <path d="M10 16H8a4 4 0 0 1 0-8h2" />
          </svg>
          {formatUsd(market.volume24h)}
        </span>
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 7v5l3 2" />
          </svg>
          {formatTimeLeft(market.endDate)}
        </span>
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s6-5.2 6-11a6 6 0 0 0-12 0c0 5.8 6 11 6 11Z" />
            <circle cx="12" cy="10" r="2" />
          </svg>
          {market.venue}
        </span>
      </div>

      <div className="market-card-signal">
        <span>{signal}</span>
        <strong>{formatPercent(market.price)} market</strong>
      </div>
    </button>
  )
}
