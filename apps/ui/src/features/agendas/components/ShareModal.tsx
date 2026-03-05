'use client'

import { useState, useCallback } from 'react'
import { Modal } from '@/components/Modal'
import Button from '@/components/Button/Button'
import styles from './ShareModal.module.scss'

interface ShareModalProps {
  open: boolean
  onClose: () => void
  clientUrl: string
  internalUrl: string
}

/**
 * Modal displaying the two generated share URLs (client-facing and internal)
 * with copy-to-clipboard buttons.
 */
export function ShareModal({
  open,
  onClose,
  clientUrl,
  internalUrl,
}: ShareModalProps) {
  const [copiedClient, setCopiedClient] = useState(false)
  const [copiedInternal, setCopiedInternal] = useState(false)

  const handleCopy = useCallback(
    async (url: string, type: 'client' | 'internal') => {
      try {
        await navigator.clipboard.writeText(url)
        if (type === 'client') {
          setCopiedClient(true)
          setTimeout(() => setCopiedClient(false), 2000)
        } else {
          setCopiedInternal(true)
          setTimeout(() => setCopiedInternal(false), 2000)
        }
      } catch {
        // Clipboard write failed -- fallback silently
      }
    },
    []
  )

  return (
    <Modal open={open} onClose={onClose} title="Share Agenda" size="md">
      <div className={styles.root}>
        <div className={styles.urlRow}>
          <label className={styles.label}>Client-Facing URL (read-only, no auth)</label>
          <div className={styles.urlField}>
            <input
              type="text"
              readOnly
              value={clientUrl}
              className={styles.urlInput}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleCopy(clientUrl, 'client')}
            >
              {copiedClient ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>

        <div className={styles.urlRow}>
          <label className={styles.label}>Internal URL (edit-enabled, auth required)</label>
          <div className={styles.urlField}>
            <input
              type="text"
              readOnly
              value={internalUrl}
              className={styles.urlInput}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleCopy(internalUrl, 'internal')}
            >
              {copiedInternal ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
