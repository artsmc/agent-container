/**
 * TabNav -- Horizontal tab bar for switching between content panels.
 *
 * Renders an accessible tab list using WAI-ARIA tab pattern.
 * The active tab is controlled by the parent via props.
 */

import styles from './TabNav.module.scss'

export interface TabDefinition {
  id: string
  label: string
}

export interface TabNavProps {
  tabs: TabDefinition[]
  activeTab: string
  onTabChange: (id: string) => void
}

export default function TabNav({ tabs, activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className={styles.tabBar} role="tablist" aria-label="Client sections">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
