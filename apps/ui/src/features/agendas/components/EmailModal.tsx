'use client'

import { useState, useCallback } from 'react'
import { Modal } from '@/components/Modal'
import Button from '@/components/Button/Button'
import type { AgendaDetail } from '../types'
import { formatCycleDates, proseMirrorToPlainText } from '../utils'
import { AGENDA_SECTIONS } from '../types'
import styles from './EmailModal.module.scss'

interface EmailModalProps {
  open: boolean
  onClose: () => void
  agenda: AgendaDetail
  defaultRecipients: string[]
  onSend: (recipients: string[], subject: string) => Promise<void>
}

/**
 * Modal for sending an agenda via email.
 * Pre-fills recipients from client config and subject from agenda metadata.
 * Includes a read-only content preview and send button with loading state.
 */
export function EmailModal({
  open,
  onClose,
  agenda,
  defaultRecipients,
  onSend,
}: EmailModalProps) {
  const [recipients, setRecipients] = useState<string[]>(defaultRecipients)
  const [recipientInput, setRecipientInput] = useState('')
  const [subject, setSubject] = useState(
    `Running Notes \u2014 ${agenda.client_name || 'Client'} \u2014 ${formatCycleDates(agenda.cycle_start, agenda.cycle_end)}`
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddRecipient = useCallback(() => {
    const email = recipientInput.trim()
    if (!email || recipients.includes(email)) return
    // Basic email validation
    if (!email.includes('@')) return
    setRecipients((prev) => [...prev, email])
    setRecipientInput('')
  }, [recipientInput, recipients])

  const handleRecipientKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAddRecipient()
      }
      if (e.key === 'Backspace' && !recipientInput && recipients.length > 0) {
        setRecipients((prev) => prev.slice(0, -1))
      }
    },
    [handleAddRecipient, recipientInput, recipients.length]
  )

  const removeRecipient = useCallback((email: string) => {
    setRecipients((prev) => prev.filter((r) => r !== email))
  }, [])

  const handleSend = useCallback(async () => {
    if (recipients.length === 0) return
    setSending(true)
    setError(null)
    try {
      await onSend(recipients, subject)
      onClose()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to send email'
      )
    } finally {
      setSending(false)
    }
  }, [recipients, subject, onSend, onClose])

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose} disabled={sending}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleSend}
        disabled={sending || recipients.length === 0}
      >
        {sending ? 'Sending...' : 'Send'}
      </Button>
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Email Agenda"
      size="lg"
      footer={footer}
    >
      <div className={styles.root}>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label className={styles.label}>Recipients</label>
          <div className={styles.recipientField}>
            <div className={styles.tags}>
              {recipients.map((email) => (
                <span key={email} className={styles.tag}>
                  {email}
                  <button
                    type="button"
                    className={styles.tagRemove}
                    onClick={() => removeRecipient(email)}
                    aria-label={`Remove ${email}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
              <input
                type="email"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={handleRecipientKeyDown}
                onBlur={handleAddRecipient}
                placeholder={
                  recipients.length === 0 ? 'Add email addresses...' : ''
                }
                className={styles.recipientInput}
              />
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={styles.subjectInput}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Preview</label>
          <div className={styles.preview}>
            {AGENDA_SECTIONS.map((section) => {
              const sectionContent = agenda.content[section.key]
              const text = proseMirrorToPlainText(sectionContent)
              return (
                <div key={section.key} className={styles.previewSection}>
                  <strong>{section.label}</strong>
                  <p>{text || '(empty)'}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
