import { useEffect, useState } from 'react'
import { TrenchMark } from './TrenchMark'

type HowItWorksModalProps = {
  open: boolean
  onClose: () => void
}

const steps = [
  {
    kicker: 'Market intake',
    title: 'Pick a market',
    body: 'Start from a live market or create a custom question. Trench pulls price, liquidity, deadline, and resolution context before any agent work begins.',
    signal: 'Live feed',
    metric: '87% market',
  },
  {
    kicker: 'Analyst agent',
    title: 'Request a priced report',
    body: 'The analyst estimates fair probability, confidence, edge, catalysts, and risks. The report is locked, hashed, and priced by expected signal value.',
    signal: 'Edge priced',
    metric: '$0.04-$2',
  },
  {
    kicker: 'x402 payment',
    title: 'Unlock with buyer USDC',
    body: 'The buyer wallet signs a Circle Gateway x402 authorization. Payment comes from the buyer side and settles to the seller address.',
    signal: 'Buyer paid',
    metric: 'Arc USDC',
  },
  {
    kicker: 'Arc proof',
    title: 'Publish the proof',
    body: 'After unlock, Trench commits the report hash, market id, signal, and payment metadata through SignalRegistry on Arc testnet.',
    signal: 'On-chain proof',
    metric: 'Proof ready',
  },
]

function clampIndex(index: number) {
  return Math.min(steps.length - 1, Math.max(0, index))
}

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[stepIndex]
  const isLastStep = stepIndex === steps.length - 1

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setStepIndex(0)
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) {
    return null
  }

  const closeModal = () => {
    setStepIndex(0)
    onClose()
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          closeModal()
        }
      }}
    >
      <section className="how-modal" role="dialog" aria-modal="true" aria-labelledby="how-modal-title">
        <button className="modal-close" type="button" onClick={closeModal} aria-label="Close how it works">
          X
        </button>

        <div className="how-visual" aria-hidden="true">
          <div className="how-side-card">
            <span>Polymarket</span>
          </div>
          <div className="how-market-card">
            <div className="how-card-topline">
              <span>{step.metric}</span>
              <strong>{step.signal}</strong>
            </div>
            <div className="how-card-brand">
              <TrenchMark />
              <span>Trench</span>
            </div>
            <h3>Will this market offer positive expected value?</h3>
            <div className="how-token-row">
              <span className="how-token">AI</span>
              <span className="how-token">402</span>
              <span className="how-token">Arc</span>
              <span className="how-token">USDC</span>
              <small>+12 signals</small>
            </div>
            <div className="how-card-metrics">
              <span>$38K</span>
              <span>3 days</span>
              <span>Global</span>
            </div>
          </div>
          <div className="how-side-card">
            <span>Arc proof</span>
          </div>
        </div>

        <div className="how-body">
          <div className="how-progress">
            <span>{String(stepIndex + 1).padStart(2, '0')}</span>
            <div className="how-dots" aria-hidden="true">
              {steps.map((item) => (
                <i key={item.title} className={item.title === step.title ? 'is-active' : ''} />
              ))}
            </div>
          </div>

          <div className="how-copy">
            <span>{step.kicker}</span>
            <h2 id="how-modal-title">{step.title}</h2>
            <p>{step.body}</p>
          </div>

          <div className="how-actions">
            <button
              type="button"
              onClick={() => setStepIndex((current) => clampIndex(current - 1))}
              disabled={stepIndex === 0}
            >
              Back
            </button>
            <button
              type="button"
              onClick={isLastStep ? closeModal : () => setStepIndex((current) => clampIndex(current + 1))}
            >
              {isLastStep ? 'Start' : 'Next'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
