/**
 * Modal -- A dialog overlay for confirmations, forms, and alerts.
 *
 * Full implementation: Feature 25 (ui-dashboard).
 */

import styles from './Modal.module.scss'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: ModalProps) {
  if (!open) return null

  return (
    <div
      data-testid="modal"
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
              data-testid="modal-close"
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
