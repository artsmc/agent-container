/**
 * TabPanel -- Wraps tab content and hides inactive panels with CSS.
 *
 * Panels are NOT unmounted when inactive. They are hidden with
 * display:none to preserve React state and cached data.
 */

import styles from './TabNav.module.scss'

export interface TabPanelProps {
  id: string
  activeTab: string
  children: React.ReactNode
}

export default function TabPanel({ id, activeTab, children }: TabPanelProps) {
  const isActive = id === activeTab

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      className={styles.panel}
      hidden={!isActive}
    >
      {children}
    </div>
  )
}
