import type { Market } from '../types/market'
import type { AgentReport } from '../types/report'
import { arcExplorerTxUrl } from '../lib/explorer'

type PublishSuccessModalProps = {
  open: boolean
  market: Market
  report?: AgentReport
  onClose: () => void
  onViewReport: () => void
}

function shortHash(value?: string) {
  if (!value) return 'pending'
  if (value.length <= 18) return value

  return `${value.slice(0, 10)}...${value.slice(-6)}`
}

export function PublishSuccessModal({ open, market, report, onClose, onViewReport }: PublishSuccessModalProps) {
  if (!open) {
    return null
  }

  const proofTxUrl = arcExplorerTxUrl(report?.proof?.txHash)

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="success-modal" role="dialog" aria-modal="true" aria-labelledby="publish-success-title">
        <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
          x
        </button>
        <div className="success-mark" aria-hidden="true">
          <span />
        </div>
        <span>Arc proof committed</span>
        <h2 id="publish-success-title">Signal published</h2>
        <p>{market.title}</p>
        <dl>
          <div>
            <dt>Tx hash</dt>
            <dd>
              {proofTxUrl ? (
                <a className="hash-link" href={proofTxUrl} target="_blank" rel="noreferrer">
                  {shortHash(report?.proof?.txHash)}
                  <span aria-hidden="true">↗</span>
                </a>
              ) : (
                shortHash(report?.proof?.txHash)
              )}
            </dd>
          </div>
          <div>
            <dt>Block</dt>
            <dd>{report?.proof?.blockNumber || 'pending'}</dd>
          </div>
          <div>
            <dt>Report hash</dt>
            <dd>{shortHash(report?.reportHash)}</dd>
          </div>
        </dl>
        <div className="success-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button type="button" onClick={onViewReport}>
            View report
          </button>
        </div>
      </section>
    </div>
  )
}
