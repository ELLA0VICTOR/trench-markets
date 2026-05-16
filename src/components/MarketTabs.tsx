import type { MarketTab } from '../types/market'

type MarketTabsProps = {
  tabs: MarketTab[]
  activeTab: MarketTab
  onTabChange: (tab: MarketTab) => void
}

export function MarketTabs({ tabs, activeTab, onTabChange }: MarketTabsProps) {
  return (
    <nav className="market-tabs" aria-label="Market filters">
      {tabs.map((tab) => (
        <button
          type="button"
          className={activeTab === tab ? 'is-active' : undefined}
          onClick={() => onTabChange(tab)}
          key={tab}
        >
          {tab}
        </button>
      ))}
    </nav>
  )
}
