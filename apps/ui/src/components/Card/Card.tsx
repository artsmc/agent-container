/**
 * Card -- A content container with a surface background and shadow.
 *
 * Used for dashboard widgets, detail panels.
 *
 * Full implementation: Feature 25 (ui-dashboard).
 */

import styles from './Card.module.scss'

export interface CardProps {
  children: React.ReactNode
  className?: string
  elevation?: 'flat' | 'raised' | 'floating'
}

export default function Card({
  children,
  className,
  elevation = 'flat',
}: CardProps) {
  return (
    <div
      data-testid="card"
      data-elevation={elevation}
      className={`${styles.root} ${className ?? ''}`}
    >
      {children}
    </div>
  )
}
