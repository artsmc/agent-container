/**
 * SlideOver -- A panel that slides in from the right edge of the viewport.
 *
 * Used for task detail panels, edit panels.
 *
 * Full implementation: Feature 26 (task-review-screen).
 */

import styles from './SlideOver.module.scss'

export interface SlideOverProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export default function SlideOver({
  open,
  onClose,
  title,
  children,
  className,
}: SlideOverProps) {
  if (!open) return null

  return (
    <div
      data-testid="slide-over"
      data-open={open}
      className={`${styles.root} ${className ?? ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.panel}>
        {title && (
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <button
              data-testid="slide-over-close"
              onClick={onClose}
              aria-label="Close"
              type="button"
            >
              &times;
            </button>
          </div>
        )}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
