type AgentProtocolProps = {
  steps: string[]
}

export function AgentProtocol({ steps }: AgentProtocolProps) {
  return (
    <section className="agent-protocol" aria-label="Agent protocol">
      <div className="section-kicker">04 / protocol trace</div>
      <div className="protocol-grid">
        {steps.map((step, index) => (
          <div className="protocol-step" key={step}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <p>{step}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
