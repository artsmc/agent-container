/**
 * Button -- Primary interactive element.
 *
 * Variants: primary, secondary, ghost, danger
 * Sizes: sm, md, lg
 *
 * Full implementation: Feature 25 (ui-dashboard) and subsequent screen features.
 */

import styles from './Button.module.scss'

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
  className?: string
  type?: 'button' | 'submit' | 'reset'
}

export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  children,
  className,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      data-testid="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      onClick={onClick}
      className={`${styles.root} ${className ?? ''}`}
    >
      {children}
    </button>
  )
}
