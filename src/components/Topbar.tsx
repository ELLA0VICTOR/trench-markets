import { TrenchMark } from './TrenchMark'

type TopbarProps = {
  query: string
  walletAddress?: string
  walletName?: string
  walletOptions: Array<{
    uuid: string
    name: string
    icon?: string
    rdns?: string
  }>
  walletStatus: 'idle' | 'connecting' | 'connected'
  walletMenuOpen: boolean
  onQueryChange: (query: string) => void
  onWalletConnect: () => void
  onWalletMenuToggle: () => void
  onWalletOptionSelect: (walletUuid: string) => void
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
  walletOptions,
  walletStatus,
  walletMenuOpen,
  onQueryChange,
  onWalletConnect,
  onWalletMenuToggle,
  onWalletOptionSelect,
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
        {walletMenuOpen && (walletAddress || walletOptions.length > 0) ? (
          <div className="wallet-menu">
            {walletAddress ? (
              <>
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
              </>
            ) : (
              <>
                <div className="wallet-menu-heading">
                  <span>Wallets found</span>
                  <strong>Choose provider</strong>
                </div>
                {walletOptions.map((wallet) => (
                  <button
                    className="wallet-option"
                    type="button"
                    key={wallet.uuid}
                    onClick={() => onWalletOptionSelect(wallet.uuid)}
                  >
                    {wallet.icon ? <img src={wallet.icon} alt="" /> : <span aria-hidden="true" />}
                    <span>
                      <strong>{wallet.name}</strong>
                      {wallet.rdns ? <small>{wallet.rdns}</small> : null}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        ) : null}
      </div>
    </header>
  )
}
