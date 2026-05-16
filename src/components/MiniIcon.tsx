type MiniIconProps = {
  type: 'signal' | 'pay' | 'arc'
}

export function MiniIcon({ type }: MiniIconProps) {
  if (type === 'pay') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.5h16v9H4z" />
        <path d="M4 10h16" />
        <path d="M15.5 14h2.5" />
      </svg>
    )
  }

  if (type === 'arc') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 18 11.7 4.8c.2-.4.4-.4.6 0L20 18" />
        <path d="M8.5 18c1.2-3.2 2.4-4.8 3.5-4.8s2.3 1.6 3.5 4.8" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 17h3l4-10 3 13 3-8h3" />
    </svg>
  )
}
