'use client'

/**
 * Modal -- A dialog overlay for confirmations, forms, and alerts.
 *
 * Features:
 * - Portal rendering to document.body
 * - Overlay backdrop with click-to-close
 * - Focus trap when open
 * - Escape key closes
 * - Header with title and close button
 * - Configurable footer (accept/cancel buttons)
 * - Width variants: sm, md, lg
 */

import { useEffect, useRef, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.scss'

export type ModalSize = 'sm' | 'md' | 'lg'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  size?: ModalSize
  footer?: ReactNode
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export default function Modal({
  open,
  onClose,
  title,
  children,
  className,
  size = 'md',
  footer,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Trap focus within the modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key !== 'Tab' || !panelRef.current) return

      const focusableElements =
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusableElements.length === 0) return

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement as HTMLElement
    document.addEventListener('keydown', handleKeyDown)

    // Focus the first focusable element within the modal
    const timer = setTimeout(() => {
      if (panelRef.current) {
        const firstFocusable =
          panelRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        firstFocusable?.focus()
      }
    }, 0)

    // Prevent body scroll
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearTimeout(timer)
      document.body.style.overflow = ''
      previousFocusRef.current?.focus()
    }
  }, [open, handleKeyDown])

  if (!open) return null

  const modal = (
    <div
      data-testid="modal"
      data-open={open}
      className={`${styles.root} ${className ?? ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={styles.overlay}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={styles.panel}
        data-size={size}
      >
        {title && (
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <button
              data-testid="modal-close"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close"
              type="button"
            >
              &times;
            </button>
          </div>
        )}
        <div className={styles.content}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}
