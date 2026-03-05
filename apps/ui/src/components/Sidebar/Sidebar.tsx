/**
 * Sidebar -- Persistent navigation sidebar for the dashboard layout.
 *
 * Supports collapse via the `collapsed` prop and `data-collapsed` attribute.
 *
 * Full implementation: Feature 25 (ui-dashboard).
 */

import styles from './Sidebar.module.scss'

export interface SidebarProps {
  children: React.ReactNode
  className?: string
  collapsed?: boolean
}

export default function Sidebar({
  children,
  className,
  collapsed = false,
}: SidebarProps) {
  return (
    <aside
      data-testid="sidebar"
      data-collapsed={collapsed}
      className={`${styles.root} ${className ?? ''}`}
    >
      {children}
    </aside>
  )
}
