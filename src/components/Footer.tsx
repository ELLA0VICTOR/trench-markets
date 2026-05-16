import { TrenchMark } from './TrenchMark'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <a className="brand" href="#top" aria-label="Trench home">
          <TrenchMark />
          <span>Trench</span>
        </a>
        <p>
          Agent-to-agent prediction market intelligence. Reports are priced with
          x402 and committed to Arc as signal proofs.
        </p>
      </div>

      <div className="footer-column">
        <h2>Markets</h2>
        <a href="#top">New</a>
        <a href="#top">Trending</a>
        <a href="#top">Ending Soon</a>
        <a href="#top">Custom</a>
      </div>

      <div className="footer-column">
        <h2>Resources</h2>
        <a href="https://docs.arc.io/" target="_blank" rel="noreferrer">
          Arc docs
        </a>
        <a href="https://developers.circle.com/" target="_blank" rel="noreferrer">
          Circle docs
        </a>
        <a href="https://docs.polymarket.com/" target="_blank" rel="noreferrer">
          Polymarket docs
        </a>
      </div>

      <div className="footer-column">
        <h2>Community</h2>
        <a href="https://github.com/ELLA0VICTOR/trench-markets" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href="https://agora.thecanteenapp.com/" target="_blank" rel="noreferrer">
          Agora
        </a>
      </div>
    </footer>
  )
}
