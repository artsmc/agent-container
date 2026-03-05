'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Button from '@/components/Button/Button'
import type { AgendaDetail, UserRole } from '../types'
import { isAgendaReadOnly, canManageAgenda } from '../utils'
import { AgendaStatus } from '../types'
import styles from './ActionBar.module.scss'

interface ActionBarProps {
  agenda: AgendaDetail
  userRole: UserRole
  onFinalize: () => void
  onShare: () => void
  onEmail: () => void
  onExport: (format: 'google_docs' | 'pdf') => void
  saving: boolean
}

/**
 * Sticky bottom action bar with Finalize, Share, Email, and Export buttons.
 * Buttons are role-aware and status-aware.
 */
export function ActionBar({
  agenda,
  userRole,
  onFinalize,
  onShare,
  onEmail,
  onExport,
  saving,
}: ActionBarProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const isReadOnly = isAgendaReadOnly(agenda.status)
  const isManager = canManageAgenda(userRole)
  const isFinalized =
    agenda.status === AgendaStatus.Finalized ||
    agenda.status === AgendaStatus.Shared

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return

    function handleClickOutside(e: MouseEvent) {
      if (
        exportRef.current &&
        !exportRef.current.contains(e.target as Node)
      ) {
        setExportOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [exportOpen])

  const handleExport = useCallback(
    (format: 'google_docs' | 'pdf') => {
      setExportOpen(false)
      onExport(format)
    },
    [onExport]
  )

  return (
    <div className={styles.root}>
      <div className={styles.left}>
        {saving && <span className={styles.savingLabel}>Saving...</span>}
      </div>

      <div className={styles.actions}>
        {isManager && (
          <Button
            variant="primary"
            onClick={onFinalize}
            disabled={isFinalized}
            aria-label="Finalize agenda"
          >
            Finalize
          </Button>
        )}

        {isManager && (
          <Button
            variant="secondary"
            onClick={onShare}
            disabled={!isFinalized || agenda.status === AgendaStatus.Shared}
            aria-label="Share agenda"
          >
            Share
          </Button>
        )}

        {isManager && (
          <Button
            variant="secondary"
            onClick={onEmail}
            disabled={!isFinalized}
            aria-label="Email agenda"
          >
            Email
          </Button>
        )}

        <div ref={exportRef} className={styles.exportWrapper}>
          <Button
            variant="ghost"
            onClick={() => setExportOpen(!exportOpen)}
            aria-label="Export agenda"
          >
            Export
          </Button>
          {exportOpen && (
            <div className={styles.exportDropdown}>
              <button
                type="button"
                className={styles.exportOption}
                onClick={() => handleExport('google_docs')}
              >
                Export to Google Docs
              </button>
              <button
                type="button"
                className={styles.exportOption}
                onClick={() => handleExport('pdf')}
              >
                Download as PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
