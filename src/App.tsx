import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CreateMarketPanel } from './components/CreateMarketPanel'
import { Footer } from './components/Footer'
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
  settleReportPayment,
} from './services/agents'
import { fetchGammaMarkets } from './services/gamma'
import type { FeedState, Market, MarketTab, PaymentState } from './types/market'
import type { AgentReport } from './types/report'

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
    setAgentReport(undefined)
    setReportState('loading')
  }

  function handleTabChange(tab: MarketTab) {
    setActiveTab(tab)
    setPaymentState('quote')
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
    try {
      const report = await requestLockedReport(selectedMarket)
      setAgentReport(report)
      setReportState('ready')
    } catch {
      setReportState('offline')
    }
  }

  async function settleReport() {
    setPaymentState('settling')
    try {
      const report = await settleReportPayment(selectedMarket.id, reportHash)
      setAgentReport(report)
      setPaymentState('paid')
      setReportState('ready')
    } catch {
      window.setTimeout(() => {
        setPaymentState('paid')
      }, 650)
      setReportState('offline')
    }
  }

  async function publishSignal() {
    try {
      const report = await publishReportProof(selectedMarket.id, reportHash)
      setAgentReport(report)
      setReportState('ready')
    } catch {
      setReportState('offline')
    }
    setPaymentState('published')
  }

  return (
    <div className="app-shell">
      <Topbar
        query={query}
        onQueryChange={setQuery}
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
          onBack={closeDetail}
          onReportRequest={requestReport}
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
