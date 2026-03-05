/**
 * Table -- Data table wrapper for listing records.
 *
 * Used for task lists, client lists, agenda lists.
 *
 * Full implementation: Feature 25 (ui-dashboard).
 */

import styles from './Table.module.scss'

export interface TableProps {
  children: React.ReactNode
  className?: string
}

export default function Table({ children, className }: TableProps) {
  return (
    <table
      data-testid="table"
      className={`${styles.root} ${className ?? ''}`}
    >
      {children}
    </table>
  )
}
