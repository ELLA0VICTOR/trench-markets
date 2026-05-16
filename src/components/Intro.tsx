import type { FeedState } from '../types/market'

type IntroProps = {
  feedState: FeedState
  runCount: number
  reportPrice: string
  agentStatus: string
}

function feedLabel(feedState: FeedState) {
  if (feedState === 'live') return 'Polymarket live'
  if (feedState === 'syncing') return 'Syncing'
  return 'Seeded'
}

export function Intro({ feedState, runCount, reportPrice, agentStatus }: IntroProps) {
  return (
    <section className="intro-grid" aria-labelledby="product-title">
      <div className="intro-copy">
        <div className="section-kicker">00 / agent market terminal</div>
        <h1 id="product-title">Trench</h1>
        <p>
          Market intelligence bought by agents, priced by x402, and committed to
          Arc as a signal trail.
        </p>
      </div>

      <div className="status-strip" aria-label="System status">
        <div>
          <span>Feed</span>
          <strong>{feedLabel(feedState)}</strong>
        </div>
        <div>
          <span>Runs</span>
          <strong>{runCount}</strong>
        </div>
        <div>
          <span>Report</span>
          <strong>{reportPrice}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{agentStatus}</strong>
        </div>
      </div>
    </section>
  )
}
