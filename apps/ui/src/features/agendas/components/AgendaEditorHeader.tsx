'use client'

import Badge from '@/components/Badge/Badge'
import type { AgendaDetail, SaveStatus } from '../types'
import { formatCycleDates, getStatusBadgeVariant, formatStatus } from '../utils'
import styles from './AgendaEditorHeader.module.scss'

interface AgendaEditorHeaderProps {
  agenda: AgendaDetail
  saveStatus: SaveStatus
  lastSavedAt: Date | null
  onRetrySave?: () => void
}

function formatSaveTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Editor header showing short ID, client name, cycle dates,
 * status badge, and auto-save indicator.
 */
export function AgendaEditorHeader({
  agenda,
  saveStatus,
  lastSavedAt,
  onRetrySave,
}: AgendaEditorHeaderProps) {
  return (
    <header className={styles.root}>
      <div className={styles.left}>
        <span className={styles.shortId}>{agenda.short_id}</span>
        {agenda.client_name && (
          <span className={styles.clientName}>{agenda.client_name}</span>
        )}
        <span className={styles.cycleDates}>
          {formatCycleDates(agenda.cycle_start, agenda.cycle_end)}
        </span>
      </div>
      <div className={styles.right}>
        <Badge variant={getStatusBadgeVariant(agenda.status)}>
          {formatStatus(agenda.status)}
        </Badge>
        <div className={styles.saveIndicator} role="status" aria-live="polite">
          {saveStatus === 'saved' && lastSavedAt && (
            <span className={styles.saved}>
              Saved &middot; {formatSaveTime(lastSavedAt)}
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className={styles.saving}>Saving...</span>
          )}
          {saveStatus === 'unsaved' && (
            <span className={styles.unsaved}>Unsaved changes</span>
          )}
          {saveStatus === 'failed' && (
            <span className={styles.failed}>
              Save failed &mdash;{' '}
              <button
                type="button"
                className={styles.retryBtn}
                onClick={onRetrySave}
              >
                Retry
              </button>
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
