const DEFAULT_ARC_EXPLORER_TX_URL = 'https://testnet.arcscan.app/tx/'

export function arcExplorerTxUrl(txHash?: string) {
  if (!txHash) {
    return undefined
  }

  const baseUrl = import.meta.env.VITE_ARC_EXPLORER_TX_URL || DEFAULT_ARC_EXPLORER_TX_URL

  return `${baseUrl.replace(/\/?$/, '/')}${txHash}`
}
