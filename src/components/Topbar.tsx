import { TrenchMark } from './TrenchMark'

type TopbarProps = {
  query: string
  onQueryChange: (query: string) => void
}

export function Topbar({ query, onQueryChange }: TopbarProps) {
  return (
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Trench home">
        <TrenchMark />
        <span>Trench</span>
      </a>
      <label className="search-box" htmlFor="market-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.8" cy="10.8" r="6.2" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          id="market-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search markets..."
        />
      </label>
      <div className="topbar-actions">
        <button className="link-button" type="button">
          How it works?
        </button>
        <div className="balance-chip">Arc USDC</div>
        <button className="wallet-button" type="button">
          Connect wallet
        </button>
      </div>
    </header>
  )
}
