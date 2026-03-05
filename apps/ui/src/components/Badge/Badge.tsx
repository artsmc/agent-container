/**
 * Badge -- A small status indicator chip.
 *
 * Variants: default, success, warning, danger, info
 */

import styles from './Badge.module.scss'

export interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  children: React.ReactNode
  className?: string
  'aria-label'?: string
}

export default function Badge({
  variant = 'default',
  children,
  className,
  'aria-label': ariaLabel,
}: BadgeProps) {
  return (
    <span
      data-testid="badge"
      data-variant={variant}
      className={`${styles.root} ${className ?? ''}`}
      aria-label={ariaLabel}
    >
      {children}
    </span>
  )
}
