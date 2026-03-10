'use client'

import { useState, useCallback, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import Button from '@/components/Button/Button'
import { getBrowserApiClient } from '@/lib/api-client-browser'
import styles from './CreateClientModal.module.scss'

interface CreateClientModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

/**
 * CreateClientModal -- modal form for creating a new client.
 *
 * Minimal form with a single required "Name" field.
 * Calls the API to create the client, then triggers onCreated on success.
 */
export function CreateClientModal({
  isOpen,
  onClose,
  onCreated,
}: CreateClientModalProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && !submitting

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!canSubmit) return

      setSubmitting(true)
      setError(null)

      try {
        await getBrowserApiClient().createClient({ name: trimmedName })
        setName('')
        onCreated()
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to create client'
        )
      } finally {
        setSubmitting(false)
      }
    },
    [canSubmit, trimmedName, onCreated]
  )

  const handleClose = useCallback(() => {
    if (submitting) return
    setName('')
    setError(null)
    onClose()
  }, [submitting, onClose])

  const footer = (
    <>
      <Button variant="secondary" onClick={handleClose} disabled={submitting}>
        Cancel
      </Button>
      <Button
        variant="primary"
        type="submit"
        onClick={() => {
          // Trigger form submit via the button for accessibility
          const form = document.querySelector<HTMLFormElement>(
            '[data-testid="create-client-form"]'
          )
          form?.requestSubmit()
        }}
        disabled={!canSubmit}
      >
        {submitting ? 'Creating...' : 'Create'}
      </Button>
    </>
  )

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="New Client"
      size="sm"
      footer={footer}
    >
      <form
        data-testid="create-client-form"
        className={styles.form}
        onSubmit={handleSubmit}
      >
        {error && (
          <div className={styles.error} data-testid="create-client-error">
            {error}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="create-client-name">
            Name
          </label>
          <input
            id="create-client-name"
            data-testid="create-client-name-input"
            type="text"
            className={styles.nameInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter client name"
            autoFocus
            disabled={submitting}
          />
        </div>
      </form>
    </Modal>
  )
}
