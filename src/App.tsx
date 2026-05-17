import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CreateMarketPanel } from './components/CreateMarketPanel'
import { Footer } from './components/Footer'
import { HowItWorksModal } from './components/HowItWorksModal'
import { MarketBoard } from './components/MarketBoard'
import { MarketDetail } from './components/MarketDetail'
import { MarketTabs } from './components/MarketTabs'
import { Topbar } from './components/Topbar'
import { marketTabs, seedMarkets } from './data/markets'
import { buildCustomMarketWithImage, reportHashFor, signalFor } from './lib/marketMath'
import {
  analyzeMarket,
  publishReportProof,
  requestLockedReport,
  settleReportFromBuyerWallet,
  settleReportPayment,
} from './services/agents'
import {
  type BrowserWalletSession,
  connectBrowserWallet,
  resetBrowserWallet,
  restoreBrowserWalletSession,
  switchBrowserWallet,
  validateStoredBrowserWalletSession,
  watchBrowserWalletSession,
} from './services/x402BuyerWallet'
import { fetchGammaMarkets } from './services/gamma'
import type { FeedState, Market, MarketTab, PaymentState } from './types/market'
import type { AgentReport } from './types/report'

type PaymentMode = 'buyer' | 'sponsored'
type WalletStatus = 'idle' | 'connecting' | 'connected'

function matchesTab(market: Market, activeTab: MarketTab) {
  if (activeTab === 'New') return true
  if (activeTab === 'Ending Soon') return market.status === 'Ending Soon'

  return market.tab === activeTab
}

function matchesSearch(market: Market, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return [market.title, market.category, market.source, market.venue, market.tab]
    .join(' ')
    .toLowerCase()
    .includes(normalized)
}

function App() {
  const [markets, setMarkets] = useState<Market[]>(seedMarkets)
  const [feedState, setFeedState] = useState<FeedState>('syncing')
  const [selectedId, setSelectedId] = useState(seedMarkets[0].id)
  const [paymentState, setPaymentState] = useState<PaymentState>('quote')
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<MarketTab>('New')
  const [createOpen, setCreateOpen] = useState(false)
  const [customQuestion, setCustomQuestion] = useState('')
  const [customImageUrl, setCustomImageUrl] = useState<string>()
  const [detailMarketId, setDetailMarketId] = useState<string | null>(null)
  const [agentReport, setAgentReport] = useState<AgentReport>()
  const [reportState, setReportState] = useState<'idle' | 'loading' | 'ready' | 'offline'>('idle')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('buyer')
  const [paymentError, setPaymentError] = useState<string>()
  const [walletAddress, setWalletAddress] = useState<string>()
  const [walletName, setWalletName] = useState<string>()
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('idle')
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)
  const [howItWorksOpen, setHowItWorksOpen] = useState(false)

  useEffect(() => {
    const restored = restoreBrowserWalletSession()
    let mounted = true
    let releaseWalletWatch: (() => void) | undefined

    function showSession(session: BrowserWalletSession) {
      setWalletAddress(session.address)
      setWalletName(session.walletName)
      setWalletStatus('connected')
    }

    function clearSession() {
      setWalletAddress(undefined)
      setWalletName(undefined)
      setWalletStatus('idle')
      setWalletMenuOpen(false)
    }

    if (restored) {
      showSession(restored)
    }

    validateStoredBrowserWalletSession()
      .then((session) => {
        if (!mounted) return

        if (session) {
          showSession(session)
          return
        }

        clearSession()
      })
      .catch(() => {
        if (mounted && !restored) {
          clearSession()
        }
      })

    watchBrowserWalletSession((session) => {
      if (!mounted) return

      if (session) {
        showSession(session)
        return
      }

      clearSession()
    }).then((release) => {
      releaseWalletWatch = release
    })

    return () => {
      mounted = false
      releaseWalletWatch?.()
    }
  }, [])

  useEffect(() => {
    if (!walletMenuOpen) {
      return
    }

    function closeOnOutsidePress(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest('.topbar-actions')) {
        return
      }

      setWalletMenuOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setWalletMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', closeOnOutsidePress)
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePress)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [walletMenuOpen])

  useEffect(() => {
    const controller = new AbortController()

    async function loadMarkets() {
      try {
        const gammaMarkets = await fetchGammaMarkets(controller.signal)

        if (gammaMarkets) {
          setMarkets(gammaMarkets)
          setSelectedId(gammaMarkets[0].id)
          setFeedState('live')
          return
        }

        setFeedState('fallback')
      } catch {
        if (!controller.signal.aborted) {
          setFeedState('fallback')
        }
      }
    }

    loadMarkets()

    return () => controller.abort()
  }, [])

  const filteredMarkets = useMemo(
    () => markets.filter((market) => matchesTab(market, activeTab) && matchesSearch(market, query)),
    [activeTab, markets, query],
  )

  const selectedMarket = useMemo(
    () =>
      markets.find((market) => market.id === detailMarketId) ||
      filteredMarkets.find((market) => market.id === selectedId) ||
      filteredMarkets[0] ||
      markets.find((market) => market.id === selectedId) ||
      markets[0],
    [detailMarketId, filteredMarkets, markets, selectedId],
  )

  const signal = signalFor(selectedMarket.price, selectedMarket.fairPrice)
  const reportHash = agentReport?.reportHash || reportHashFor(selectedMarket)
  const proofLabel = agentReport?.proof?.txHash || agentReport?.proof?.proofId || 'queued for Arc writer'

  useEffect(() => {
    if (!detailMarketId) {
      return
    }

    const controller = new AbortController()

    analyzeMarket(selectedMarket, controller.signal)
      .then((report) => {
        setAgentReport(report)
        setReportState('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setReportState('offline')
        }
      })

    return () => controller.abort()
  }, [detailMarketId, selectedMarket])

  function selectMarket(id: string) {
    setSelectedId(id)
    setDetailMarketId(id)
    setPaymentState('quote')
    setPaymentMode('buyer')
    setPaymentError(undefined)
    setAgentReport(undefined)
    setReportState('loading')
  }

  function handleTabChange(tab: MarketTab) {
    setActiveTab(tab)
    setPaymentState('quote')
    setPaymentError(undefined)
  }

  function handleCustomMarket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = customQuestion.trim()
    if (!trimmed) return

    const customMarket = buildCustomMarketWithImage(trimmed, customImageUrl)
    setMarkets((current) => [customMarket, ...current])
    setSelectedId(customMarket.id)
    setDetailMarketId(customMarket.id)
    setActiveTab('Custom')
    setCustomQuestion('')
    setCustomImageUrl(undefined)
    setCreateOpen(false)
    setPaymentState('quote')
    setPaymentMode('buyer')
    setPaymentError(undefined)
    setAgentReport(undefined)
    setReportState('loading')
  }

  function closeDetail() {
    setDetailMarketId(null)
    setReportState('idle')
  }

  function handleCustomImage(file: File | null) {
    if (!file) {
      setCustomImageUrl(undefined)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomImageUrl(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  async function requestReport() {
    setPaymentState('required')
    setPaymentError(undefined)
    try {
      const report = await requestLockedReport(selectedMarket)
      setAgentReport(report)
      setReportState('ready')
    } catch {
      setReportState('offline')
    }
  }

  async function connectWallet() {
    setWalletStatus('connecting')
    try {
      const wallet = await connectBrowserWallet()
      setWalletAddress(wallet.address)
      setWalletName(wallet.walletName)
      setWalletStatus('connected')
      setWalletMenuOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed.'
      setWalletStatus(walletAddress ? 'connected' : 'idle')
      window.alert(message)
    }
  }

  async function switchWallet() {
    setWalletStatus('connecting')
    try {
      const wallet = await switchBrowserWallet()
      setWalletAddress(wallet.address)
      setWalletName(wallet.walletName)
      setWalletStatus('connected')
      setWalletMenuOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet switch failed.'
      setWalletStatus(walletAddress ? 'connected' : 'idle')
      window.alert(message)
    }
  }

  async function copyWalletAddress() {
    if (!walletAddress) return

    try {
      await navigator.clipboard.writeText(walletAddress)
      setWalletMenuOpen(false)
    } catch {
      window.alert(walletAddress)
    }
  }

  function disconnectWallet() {
    resetBrowserWallet()
    setWalletAddress(undefined)
    setWalletName(undefined)
    setWalletStatus('idle')
    setWalletMenuOpen(false)
  }

  async function settleReport(mode: PaymentMode) {
    setPaymentMode(mode)
    setPaymentState('settling')
    setPaymentError(undefined)
    try {
      const report =
        mode === 'buyer'
          ? await settleReportFromBuyerWallet(selectedMarket.id, reportHash)
          : await settleReportPayment(selectedMarket.id, reportHash)
      const wallet = restoreBrowserWalletSession()

      if (wallet) {
        setWalletAddress(wallet.address)
        setWalletName(wallet.walletName)
        setWalletStatus('connected')
      }

      setAgentReport(report)
      setPaymentState('paid')
      setReportState('ready')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed.'
      setPaymentError(message)
      setPaymentState('required')
    }
  }

  async function publishSignal() {
    try {
      const report = await publishReportProof(selectedMarket.id, reportHash)
      setAgentReport(report)
      setReportState('ready')
      setPaymentState('published')
    } catch {
      setReportState('offline')
    }
  }

  return (
    <div className="app-shell">
      <HowItWorksModal open={howItWorksOpen} onClose={() => setHowItWorksOpen(false)} />
      <Topbar
        query={query}
        walletAddress={walletAddress}
        walletName={walletName}
        walletStatus={walletStatus}
        walletMenuOpen={walletMenuOpen}
        onQueryChange={setQuery}
        onWalletConnect={connectWallet}
        onWalletMenuToggle={() => setWalletMenuOpen((open) => !open)}
        onWalletCopy={copyWalletAddress}
        onWalletSwitch={switchWallet}
        onWalletDisconnect={disconnectWallet}
        onHowItWorks={() => {
          setWalletMenuOpen(false)
          setHowItWorksOpen(true)
        }}
      />

      {detailMarketId ? (
        <MarketDetail
          market={selectedMarket}
          paymentState={paymentState}
          reportState={reportState}
          agentReport={agentReport}
          signal={agentReport?.signal || signal}
          reportHash={reportHash}
          proofLabel={proofLabel}
          paymentMode={paymentMode}
          paymentError={paymentError}
          onBack={closeDetail}
          onReportRequest={requestReport}
          onPaymentModeChange={setPaymentMode}
          onSettleReport={settleReport}
          onSignalPublish={publishSignal}
        />
      ) : (
        <>
          <MarketTabs tabs={marketTabs} activeTab={activeTab} onTabChange={handleTabChange} />
          <main id="top" className="markets-layout">
            <CreateMarketPanel
              open={createOpen}
              question={customQuestion}
              imagePreview={customImageUrl}
              onQuestionChange={setCustomQuestion}
              onImageChange={handleCustomImage}
              onSubmit={handleCustomMarket}
              onClose={() => setCreateOpen(false)}
            />
            <MarketBoard
              markets={filteredMarkets}
              selectedMarket={selectedMarket}
              feedState={feedState}
              onMarketSelect={selectMarket}
              onCreateClick={() => setCreateOpen((open) => !open)}
            />
          </main>
        </>
      )}

      <Footer />
    </div>
  )
}

export default App
