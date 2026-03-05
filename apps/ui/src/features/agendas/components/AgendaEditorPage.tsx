'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Modal } from '@/components/Modal'
import Button from '@/components/Button/Button'
import type {
  AgendaDetail,
  AgendaContent,
  SaveStatus,
  ProseMirrorDoc,
} from '../types'
import { AGENDA_SECTIONS, AgendaStatus } from '../types'
import { isAgendaReadOnly } from '../utils'
import { patchAgendaContent } from '../actions'
import { useAgendaMutations } from '../hooks/useAgendaMutations'
import { useAgendaSync } from '../hooks/useAgendaSync'
import { useAgendaComments } from '../hooks/useAgendaComments'
import { AgendaEditorHeader } from './AgendaEditorHeader'
import { AgendaSection } from './AgendaSection'
import { CommentsPanel } from './CommentsPanel'
import { VersionHistoryPanel } from './VersionHistoryPanel'
import { ActionBar } from './ActionBar'
import { ShareModal } from './ShareModal'
import { EmailModal } from './EmailModal'
import { PresenceIndicator } from './PresenceIndicator'
import styles from './AgendaEditorPage.module.scss'

const AUTOSAVE_DELAY = 1500

interface AgendaEditorPageProps {
  initialAgenda: AgendaDetail
}

/**
 * The main agenda editor page component.
 * Manages editor state, auto-save debounce, collaborative sync,
 * and action wiring (finalize, share, email, export).
 */
export function AgendaEditorPage({ initialAgenda }: AgendaEditorPageProps) {
  const { user } = useAuth()

  // Core state
  const [agenda, setAgenda] = useState<AgendaDetail>(initialAgenda)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [lockedBanner, setLockedBanner] = useState(false)

  // Panel toggles
  const [showComments, setShowComments] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // Modals
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const [shareUrls, setShareUrls] = useState<{
    client_url: string
    internal_url: string
  } | null>(null)
  const [showEmailModal, setShowEmailModal] = useState(false)

  // Derived state
  const readOnly = isAgendaReadOnly(agenda.status) || lockedBanner

  // Auto-save debounce refs
  const pendingContentRef = useRef<Partial<AgendaContent>>({})
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)

  // Hooks
  const mutations = useAgendaMutations()
  const { comments, addComment, addReply } = useAgendaComments(
    agenda.comments,
    user.name
  )

  // Auto-save function
  const triggerAutoSave = useCallback(async () => {
    const pending = { ...pendingContentRef.current }
    if (Object.keys(pending).length === 0) return

    pendingContentRef.current = {}
    isTypingRef.current = false
    setSaveStatus('saving')

    const result = await patchAgendaContent(agenda.id, pending, agenda.version)

    if (result.success) {
      setSaveStatus('saved')
      setLastSavedAt(new Date())
      if (result.version !== undefined) {
        setAgenda((prev) => ({ ...prev, version: result.version as number }))
      }
    } else if (result.code === 'LOCKED') {
      setLockedBanner(true)
      setSaveStatus('failed')
    } else if (result.code === 'CONFLICT') {
      // Refresh content from server
      setSaveStatus('failed')
    } else {
      setSaveStatus('failed')
    }
  }, [agenda.id, agenda.version])

  // Retry save
  const handleRetrySave = useCallback(() => {
    triggerAutoSave()
  }, [triggerAutoSave])

  // Section change handler
  const handleSectionChange = useCallback(
    (sectionKey: keyof AgendaContent, value: ProseMirrorDoc) => {
      // Update local content immediately
      setAgenda((prev) => ({
        ...prev,
        content: { ...prev.content, [sectionKey]: value },
      }))

      // Accumulate pending changes
      pendingContentRef.current = {
        ...pendingContentRef.current,
        [sectionKey]: value,
      }

      setSaveStatus('unsaved')
      isTypingRef.current = true

      // Reset debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        triggerAutoSave()
      }, AUTOSAVE_DELAY)
    },
    [triggerAutoSave]
  )

  // Collaborative sync
  const handleRemoteUpdate = useCallback(
    (updatedAgenda: AgendaDetail) => {
      if (isTypingRef.current) {
        // Queue the update for when typing stops
        return
      }
      setAgenda(updatedAgenda)
    },
    []
  )

  useAgendaSync(agenda.id, agenda.version, handleRemoteUpdate, !readOnly)

  // Action handlers
  const handleFinalize = useCallback(() => {
    setShowFinalizeConfirm(true)
    setFinalizeError(null)
  }, [])

  const handleConfirmFinalize = useCallback(async () => {
    const result = await mutations.finalize(agenda.id)
    if (result.success) {
      setShowFinalizeConfirm(false)
      setAgenda((prev) => ({
        ...prev,
        status: AgendaStatus.Finalized,
      }))
      setLockedBanner(true)
    } else {
      setFinalizeError(result.error ?? 'Failed to finalize')
    }
  }, [mutations, agenda.id])

  const handleShare = useCallback(async () => {
    const result = await mutations.share(agenda.id)
    if (result.urls) {
      setShareUrls(result.urls)
      setAgenda((prev) => ({
        ...prev,
        status: AgendaStatus.Shared,
      }))
    }
  }, [mutations, agenda.id])

  const handleEmail = useCallback(() => {
    setShowEmailModal(true)
  }, [])

  const handleSendEmail = useCallback(
    async (recipients: string[], subject: string) => {
      const result = await mutations.email(agenda.id, recipients, subject)
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to send')
      }
    },
    [mutations, agenda.id]
  )

  const handleExport = useCallback(
    async (format: 'google_docs' | 'pdf') => {
      const result = await mutations.exportAgenda(agenda.id, format)
      if (result.url && format === 'google_docs') {
        window.open(result.url, '_blank')
      }
    },
    [mutations, agenda.id]
  )

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Determine layout class
  let layoutClass = styles.editorLayout
  if (showComments && showHistory) {
    layoutClass = `${styles.editorLayout} ${styles.bothOpen}`
  } else if (showComments) {
    layoutClass = `${styles.editorLayout} ${styles.commentsOpen}`
  } else if (showHistory) {
    layoutClass = `${styles.editorLayout} ${styles.historyOpen}`
  }

  return (
    <div className={layoutClass}>
      {/* Header */}
      <div className={styles.headerRow}>
        <AgendaEditorHeader
          agenda={agenda}
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          onRetrySave={handleRetrySave}
        />
        <div className={styles.headerActions}>
          {agenda.active_users && (
            <PresenceIndicator
              users={agenda.active_users}
              currentUserId={user.sub}
            />
          )}
        </div>
      </div>

      {/* Locked banner */}
      {lockedBanner && (
        <div className={styles.lockedBanner}>
          This agenda is finalized and locked for editing.
        </div>
      )}

      {/* Content area */}
      <div className={styles.contentArea}>
        {AGENDA_SECTIONS.map((section) => (
          <AgendaSection
            key={section.key}
            label={section.label}
            sectionKey={section.key}
            value={agenda.content[section.key]}
            onChange={(value) => handleSectionChange(section.key, value)}
            readOnly={readOnly}
            onCommit={() => triggerAutoSave()}
          />
        ))}
      </div>

      {/* Comments panel */}
      <CommentsPanel
        comments={comments}
        open={showComments}
        onToggle={() => setShowComments(!showComments)}
        onAddComment={addComment}
        onAddReply={addReply}
      />

      {/* Version history panel */}
      <VersionHistoryPanel
        entries={agenda.version_history}
        open={showHistory}
        onToggle={() => setShowHistory(!showHistory)}
      />

      {/* Action bar */}
      <div className={styles.actionBarRow}>
        <ActionBar
          agenda={agenda}
          userRole={user.role}
          onFinalize={handleFinalize}
          onShare={handleShare}
          onEmail={handleEmail}
          onExport={handleExport}
          saving={saveStatus === 'saving'}
        />
      </div>

      {/* Finalize confirmation modal */}
      <Modal
        open={showFinalizeConfirm}
        onClose={() => setShowFinalizeConfirm(false)}
        title="Finalize Agenda"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowFinalizeConfirm(false)}
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
          Finalize this agenda? This will lock editing and prevent further
          changes.
        </p>
        {finalizeError && (
          <p className={styles.errorText}>{finalizeError}</p>
        )}
      </Modal>

      {/* Share modal */}
      {shareUrls && (
        <ShareModal
          open={!!shareUrls}
          onClose={() => setShareUrls(null)}
          clientUrl={shareUrls.client_url}
          internalUrl={shareUrls.internal_url}
        />
      )}

      {/* Email modal */}
      {showEmailModal && (
        <EmailModal
          open={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          agenda={agenda}
          defaultRecipients={agenda.default_recipients ?? []}
          onSend={handleSendEmail}
        />
      )}
    </div>
  )
}
