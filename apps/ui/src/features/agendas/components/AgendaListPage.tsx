'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import Button from '@/components/Button/Button'
import { Modal } from '@/components/Modal'
import { useAgendaList } from '../hooks/useAgendaList'
import { useAgendaMutations } from '../hooks/useAgendaMutations'
import type { AgendaSummary, ShareResponse } from '../types'
import { AgendaCard } from './AgendaCard'
import { ShareModal } from './ShareModal'
import styles from './AgendaListPage.module.scss'

interface AgendaListPageProps {
  clientId: string
}

/**
 * Agenda list page showing all agendas for a client.
 * Supports finalize (with confirmation), share (with URL modal),
 * and email actions directly from the list.
 */
export function AgendaListPage({ clientId }: AgendaListPageProps) {
  const { user } = useAuth()
  const { agendas, loading, error, retry } = useAgendaList(clientId)
  const { finalize, share } = useAgendaMutations()

  const [confirmFinalize, setConfirmFinalize] = useState<AgendaSummary | null>(
    null
  )
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const [shareUrls, setShareUrls] = useState<ShareResponse | null>(null)
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})

  const handleFinalize = useCallback((agenda: AgendaSummary) => {
    setConfirmFinalize(agenda)
    setFinalizeError(null)
  }, [])

  const handleConfirmFinalize = useCallback(async () => {
    if (!confirmFinalize) return
    const result = await finalize(confirmFinalize.id)
    if (result.success) {
      setConfirmFinalize(null)
      retry()
    } else {
      setFinalizeError(result.error ?? 'Failed to finalize')
    }
  }, [confirmFinalize, finalize, retry])

  const handleShare = useCallback(
    async (agenda: AgendaSummary) => {
      const result = await share(agenda.id)
      if (result.urls) {
        setShareUrls(result.urls)
      } else {
        setCardErrors((prev) => ({
          ...prev,
          [agenda.id]: result.error ?? 'Failed to share',
        }))
      }
    },
    [share]
  )

  const handleEmail = useCallback((agenda: AgendaSummary) => {
    // Navigate to editor with email action
    window.location.href = `/agendas/${agenda.short_id}?action=email`
  }, [])

  // Loading state
  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.skeletonList}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={styles.root}>
        <div className={styles.errorState}>
          <p>Failed to load agendas.</p>
          <Button variant="primary" onClick={retry}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // Empty state
  if (agendas.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.emptyState}>
          <p>
            No agendas have been created for this client yet. Agendas are
            created automatically by the intake workflow.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Agendas</h1>

      <div className={styles.list}>
        {agendas.map((agenda) => (
          <AgendaCard
            key={agenda.id}
            agenda={agenda}
            userRole={user.role}
            onFinalize={handleFinalize}
            onShare={handleShare}
            onEmail={handleEmail}
            error={cardErrors[agenda.id]}
          />
        ))}
      </div>

      {/* Finalize confirmation modal */}
      <Modal
        open={!!confirmFinalize}
        onClose={() => setConfirmFinalize(null)}
        title="Finalize Agenda"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmFinalize(null)}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmFinalize}>
              Confirm
            </Button>
          </>
        }
      >
        <p>
          Finalize this agenda? This will lock editing and mark it as ready to
          share.
        </p>
        {finalizeError && (
          <p className={styles.modalError}>{finalizeError}</p>
        )}
      </Modal>

      {/* Share URLs modal */}
      {shareUrls && (
        <ShareModal
          open={!!shareUrls}
          onClose={() => {
            setShareUrls(null)
            retry()
          }}
          clientUrl={shareUrls.client_url}
          internalUrl={shareUrls.internal_url}
        />
      )}
    </div>
  )
}
