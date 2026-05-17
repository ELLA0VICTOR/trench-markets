import { TrenchMark } from './TrenchMark'

type TopbarProps = {
  query: string
  walletAddress?: string
  walletName?: string
  walletStatus: 'idle' | 'connecting' | 'connected'
  walletMenuOpen: boolean
  onQueryChange: (query: string) => void
  onWalletConnect: () => void
  onWalletMenuToggle: () => void
  onWalletCopy: () => void
  onWalletSwitch: () => void
  onWalletDisconnect: () => void
  onHowItWorks: () => void
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function Topbar({
  query,
  walletAddress,
  walletName,
  walletStatus,
  walletMenuOpen,
  onQueryChange,
  onWalletConnect,
  onWalletMenuToggle,
  onWalletCopy,
  onWalletSwitch,
  onWalletDisconnect,
  onHowItWorks,
}: TopbarProps) {
  const walletLabel =
    walletStatus === 'connecting'
      ? 'Connecting'
      : walletAddress
        ? shortAddress(walletAddress)
        : 'Connect wallet'

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
        <button className="link-button" type="button" onClick={onHowItWorks}>
          How it works?
        </button>
        <div className="balance-chip">Arc USDC</div>
        <button
          className="wallet-button"
          type="button"
          title={walletName || 'Connect wallet'}
          onClick={walletAddress ? onWalletMenuToggle : onWalletConnect}
          disabled={walletStatus === 'connecting'}
          aria-expanded={walletAddress ? walletMenuOpen : undefined}
        >
          {walletLabel}
        </button>
        {walletAddress && walletMenuOpen ? (
          <div className="wallet-menu">
            <div className="wallet-menu-heading">
              <span>{walletName || 'Wallet'}</span>
              <strong>{shortAddress(walletAddress)}</strong>
            </div>
            <button type="button" onClick={onWalletCopy}>
              Copy address
            </button>
            <button type="button" onClick={onWalletSwitch}>
              Change wallet
            </button>
            <button type="button" onClick={onWalletDisconnect}>
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
