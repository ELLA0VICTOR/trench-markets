export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function formatUsd(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  }

  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}K`
  }

  return `$${Math.round(value)}`
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatTimeLeft(value: string) {
  const msUntilEnd = new Date(value).getTime() - Date.now()

  if (msUntilEnd <= 0) {
    return 'Ended'
  }

  const days = Math.floor(msUntilEnd / 86_400_000)
  const hours = Math.floor((msUntilEnd % 86_400_000) / 3_600_000)

  if (days > 0) {
    return `${days}d ${hours}h`
  }

  return `${Math.max(hours, 1)}h`
}
