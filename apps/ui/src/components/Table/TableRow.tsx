/**
 * TableRow -- A single row within a Table component.
 *
 * Full implementation: Feature 25 (ui-dashboard).
 */

import styles from './Table.module.scss'

export interface TableRowProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export default function TableRow({ children, className, onClick }: TableRowProps) {
  return (
    <tr
      data-testid="table-row"
      className={`${styles.row} ${className ?? ''}`}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}
