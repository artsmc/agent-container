/**
 * Badge -- A small status indicator chip.
 *
 * Variants: default, success, warning, danger, info
 *
 * Full implementation: Feature 25 (ui-dashboard).
 */

import styles from './Badge.module.scss'

export interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  children: React.ReactNode
  className?: string
}

export default function Badge({
  variant = 'default',
  children,
  className,
}: BadgeProps) {
  return (
    <span
      data-testid="badge"
      data-variant={variant}
      className={`${styles.root} ${className ?? ''}`}
    >
      {children}
    </span>
  )
}
