/**
 * Badge -- A small status indicator chip.
 *
 * Variants: default, success, warning, danger, info, primary
 * Sizes: sm (default), md
 */

import styles from './Badge.module.scss'

export interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary'
  size?: 'sm' | 'md'
  children: React.ReactNode
  className?: string
  'aria-label'?: string
}

export default function Badge({
  variant = 'default',
  size = 'sm',
  children,
  className,
  'aria-label': ariaLabel,
}: BadgeProps) {
  return (
    <span
      data-testid="badge"
      data-variant={variant}
      data-size={size}
      className={`${styles.root} ${className ?? ''}`}
      aria-label={ariaLabel}
    >
      {children}
    </span>
  )
}
