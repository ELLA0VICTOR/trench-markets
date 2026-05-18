import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CreateMarketPanel } from './components/CreateMarketPanel'
import { Footer } from './components/Footer'
import { HowItWorksModal } from './components/HowItWorksModal'
import { MarketBoard } from './components/MarketBoard'
import { MarketDetail } from './components/MarketDetail'
import { MarketTabs } from './components/MarketTabs'
import { PublishSuccessModal } from './components/PublishSuccessModal'
import { ReportPage } from './components/ReportPage'
import { Topbar } from './components/Topbar'
import { marketTabs, seedMarkets } from './data/markets'
import { buildCustomMarketWithImage, reportHashFor, signalFor } from './lib/marketMath'
import {
  analyzeMarket,
  fetchSavedReport,
  publishReportProof,
  requestLockedReport,
  settleReportFromBuyerWallet,
  settleReportPayment,
} from './services/agents'
import {
  type BrowserWalletOption,
  type BrowserWalletSession,
  connectBrowserWallet,
  listBrowserWallets,
  resetBrowserWallet,
  restoreBrowserWalletSession,
  validateStoredBrowserWalletSession,
  watchBrowserWalletSession,
} from './services/x402BuyerWallet'
import { fetchGammaMarkets } from './services/gamma'
import type { FeedState, Market, MarketTab, PaymentState } from './types/market'
import type { AgentReport } from './types/report'

type PaymentMode = 'buyer' | 'sponsored'
type WalletStatus = 'idle' | 'connecting' | 'connected'

function initialRouteFromUrl() {
  if (typeof window === 'undefined') {
    return { marketId: null, reportId: null }
  }

  const params = new URLSearchParams(window.location.search)

  return {
    marketId: params.get('market'),
    reportId: params.get('report'),
  }
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message

    if (typeof message === 'string') {
      return message
    }
  }

  return fallback
}

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
  const initialRoute = useMemo(() => initialRouteFromUrl(), [])
  const initialMarketId = initialRoute.reportId || initialRoute.marketId
  const [markets, setMarkets] = useState<Market[]>(seedMarkets)
  const [feedState, setFeedState] = useState<FeedState>('syncing')
  const [selectedId, setSelectedId] = useState(initialMarketId || seedMarkets[0].id)
  const [paymentState, setPaymentState] = useState<PaymentState>('quote')
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<MarketTab>('New')
  const [createOpen, setCreateOpen] = useState(false)
  const [customQuestion, setCustomQuestion] = useState('')
  const [customImageUrl, setCustomImageUrl] = useState<string>()
  const [detailMarketId, setDetailMarketId] = useState<string | null>(initialRoute.reportId ? null : initialRoute.marketId)
  const [reportMarketId, setReportMarketId] = useState<string | null>(initialRoute.reportId)
  const [agentReport, setAgentReport] = useState<AgentReport>()
  const [reportState, setReportState] = useState<'idle' | 'loading' | 'ready' | 'offline'>(
    initialMarketId ? 'loading' : 'idle',
  )
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('buyer')
  const [paymentError, setPaymentError] = useState<string>()
  const [walletAddress, setWalletAddress] = useState<string>()
  const [walletName, setWalletName] = useState<string>()
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('idle')
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)
  const [walletOptions, setWalletOptions] = useState<BrowserWalletOption[]>([])
  const [howItWorksOpen, setHowItWorksOpen] = useState(false)
  const [publishSuccessOpen, setPublishSuccessOpen] = useState(false)

  useEffect(() => {
    const url = new URL(window.location.href)

    if (reportMarketId) {
      url.searchParams.set('report', reportMarketId)
      url.searchParams.delete('market')
    } else if (detailMarketId) {
      url.searchParams.set('market', detailMarketId)
      url.searchParams.delete('report')
    } else {
      url.searchParams.delete('market')
      url.searchParams.delete('report')
    }

    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [detailMarketId, reportMarketId])

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
      setWalletOptions([])
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
          if (!initialMarketId) {
            setSelectedId(gammaMarkets[0].id)
          }
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
  }, [initialMarketId])

  const filteredMarkets = useMemo(
    () => markets.filter((market) => matchesTab(market, activeTab) && matchesSearch(market, query)),
    [activeTab, markets, query],
  )

  const selectedMarket = useMemo(
    () =>
      markets.find((market) => market.id === reportMarketId) ||
      markets.find((market) => market.id === detailMarketId) ||
      filteredMarkets.find((market) => market.id === selectedId) ||
      filteredMarkets[0] ||
      markets.find((market) => market.id === selectedId) ||
      markets[0],
    [detailMarketId, filteredMarkets, markets, reportMarketId, selectedId],
  )

  const signal = signalFor(selectedMarket.price, selectedMarket.fairPrice)
  const reportHash = agentReport?.reportHash || reportHashFor(selectedMarket)
  const proofLabel = agentReport?.proof?.txHash || agentReport?.proof?.proofId || 'queued for Arc writer'

  useEffect(() => {
    if (!detailMarketId) {
      return
    }

    if (selectedMarket.id !== detailMarketId) {
      return
    }

    const controller = new AbortController()

    analyzeMarket(selectedMarket, walletAddress, controller.signal)
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
  }, [detailMarketId, selectedMarket, walletAddress])

  useEffect(() => {
    if (!reportMarketId) {
      return
    }

    if (selectedMarket.id !== reportMarketId) {
      return
    }

    if (agentReport?.marketId === reportMarketId && !agentReport.locked) {
      return
    }

    const controller = new AbortController()

    fetchSavedReport(reportMarketId, walletAddress, controller.signal)
      .then((report) => {
        setAgentReport(report)
        setReportState('ready')
        if (!report.locked && paymentState !== 'published') {
          setPaymentState(report.proof?.status === 'published' ? 'published' : 'paid')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setReportState('offline')
        }
      })

    return () => controller.abort()
  }, [agentReport?.locked, agentReport?.marketId, paymentState, reportMarketId, selectedMarket, walletAddress])

  function selectMarket(id: string) {
    setSelectedId(id)
    setDetailMarketId(id)
    setReportMarketId(null)
    setPaymentState('quote')
    setPaymentMode('buyer')
    setPaymentError(undefined)
    setAgentReport(undefined)
    setReportState('loading')
    setPublishSuccessOpen(false)
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
    setReportMarketId(null)
    setActiveTab('Custom')
    setCustomQuestion('')
    setCustomImageUrl(undefined)
    setCreateOpen(false)
    setPaymentState('quote')
    setPaymentMode('buyer')
    setPaymentError(undefined)
    setAgentReport(undefined)
    setReportState('loading')
    setPublishSuccessOpen(false)
  }

  function closeDetail() {
    setDetailMarketId(null)
    setReportMarketId(null)
    setReportState('idle')
  }

  function viewReport() {
    setPublishSuccessOpen(false)
    setReportMarketId(selectedMarket.id)
    setDetailMarketId(null)
  }

  function backToMarketFromReport() {
    setReportMarketId(null)
    setDetailMarketId(selectedMarket.id)
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
      const report = await requestLockedReport(selectedMarket, walletAddress)
      setAgentReport(report)
      setReportState('ready')
      if (!report.locked) {
        setPaymentState(report.proof?.status === 'published' ? 'published' : 'paid')
      }
    } catch {
      setReportState('offline')
    }
  }

  async function connectWallet() {
    setWalletStatus('connecting')
    try {
      const wallets = await listBrowserWallets()

      if (wallets.length > 1) {
        setWalletOptions(wallets)
        setWalletStatus(walletAddress ? 'connected' : 'idle')
        setWalletMenuOpen(true)
        return
      }

      await connectWalletOption(wallets[0]?.uuid)
    } catch (error) {
      const message = readableError(error, 'Wallet connection failed.')
      setWalletStatus(walletAddress ? 'connected' : 'idle')
      window.alert(message)
    }
  }

  async function connectWalletOption(walletUuid?: string) {
    setWalletStatus('connecting')
    try {
      const wallet = await connectBrowserWallet(walletUuid)
      setWalletAddress(wallet.address)
      setWalletName(wallet.walletName)
      setWalletStatus('connected')
      setWalletMenuOpen(false)
      setWalletOptions([])
    } catch (error) {
      const message = readableError(error, 'Wallet connection failed.')
      setWalletStatus(walletAddress ? 'connected' : 'idle')
      window.alert(message)
    }
  }

  async function switchWallet() {
    setWalletStatus('connecting')
    try {
      resetBrowserWallet()
      const wallets = await listBrowserWallets()

      if (wallets.length > 1) {
        setWalletAddress(undefined)
        setWalletName(undefined)
        setWalletOptions(wallets)
        setWalletStatus('idle')
        setWalletMenuOpen(true)
        return
      }

      await connectWalletOption(wallets[0]?.uuid)
    } catch (error) {
      const message = readableError(error, 'Wallet switch failed.')
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
    setWalletOptions([])
  }

  async function settleReport(mode: PaymentMode) {
    setPaymentMode(mode)
    setPaymentState('settling')
    setPaymentError(undefined)
    try {
      const lockedReport = await requestLockedReport(selectedMarket, walletAddress)
      setAgentReport(lockedReport)
      setReportState('ready')

      if (!lockedReport.locked) {
        setPaymentState(lockedReport.proof?.status === 'published' ? 'published' : 'paid')
        return true
      }

      const report =
        mode === 'buyer'
          ? await settleReportFromBuyerWallet(selectedMarket.id, lockedReport.reportHash)
          : await settleReportPayment(selectedMarket.id, lockedReport.reportHash, walletAddress)
      const wallet = restoreBrowserWalletSession()

      if (wallet) {
        setWalletAddress(wallet.address)
        setWalletName(wallet.walletName)
        setWalletStatus('connected')
      }

      setAgentReport(report)
      setPaymentState('paid')
      setReportState('ready')
      return true
    } catch (error) {
      const message = readableError(error, 'Payment failed.')
      setPaymentError(message)
      setPaymentState('required')
      return false
    }
  }

  async function publishSignal() {
    if (paymentState === 'publishing' || paymentState === 'published') {
      return
    }

    setPaymentState('publishing')
    setPaymentError(undefined)
    try {
      const report = await publishReportProof(selectedMarket.id, reportHash, walletAddress)
      setAgentReport(report)
      setReportState('ready')
      setPaymentState('published')
      setPublishSuccessOpen(true)
    } catch (error) {
      setPaymentError(readableError(error, 'Arc publish failed.'))
      setReportState('ready')
      setPaymentState('paid')
    }
  }

  return (
    <div className="app-shell">
      <HowItWorksModal open={howItWorksOpen} onClose={() => setHowItWorksOpen(false)} />
      <PublishSuccessModal
        open={publishSuccessOpen}
        market={selectedMarket}
        report={agentReport}
        onClose={() => setPublishSuccessOpen(false)}
        onViewReport={viewReport}
      />
      <Topbar
        query={query}
        walletAddress={walletAddress}
        walletName={walletName}
        walletStatus={walletStatus}
        walletMenuOpen={walletMenuOpen}
        walletOptions={walletOptions}
        onQueryChange={setQuery}
        onWalletConnect={connectWallet}
        onWalletMenuToggle={() => setWalletMenuOpen((open) => !open)}
        onWalletOptionSelect={connectWalletOption}
        onWalletCopy={copyWalletAddress}
        onWalletSwitch={switchWallet}
        onWalletDisconnect={disconnectWallet}
        onHowItWorks={() => {
          setWalletMenuOpen(false)
          setHowItWorksOpen(true)
        }}
      />

      {reportMarketId ? (
        <ReportPage
          market={selectedMarket}
          report={agentReport}
          paymentState={paymentState}
          signal={agentReport?.signal || signal}
          onBackToMarket={backToMarketFromReport}
        />
      ) : detailMarketId ? (
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
          onViewReport={viewReport}
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
