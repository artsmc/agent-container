'use client'

import Badge from '@/components/Badge/Badge'
import type { AgendaVersionEntry } from '../types'
import { formatRelativeTime, proseMirrorToPlainText } from '../utils'
import styles from './VersionHistoryPanel.module.scss'

interface VersionHistoryPanelProps {
  entries: AgendaVersionEntry[]
  open: boolean
  onToggle: () => void
}

function getSourceVariant(
  source: 'agent' | 'ui' | 'terminal'
): 'info' | 'success' | 'warning' {
  switch (source) {
    case 'agent':
      return 'info'
    case 'ui':
      return 'success'
    case 'terminal':
      return 'warning'
  }
}

/**
 * Collapsible version history panel showing edit entries
 * with source badges and diff views.
 */
export function VersionHistoryPanel({
  entries,
  open,
  onToggle,
}: VersionHistoryPanelProps) {
  return (
    <aside
      className={`${styles.root} ${open ? styles.open : ''}`}
      aria-label="Version history"
    >
      <button
        type="button"
        className={styles.toggle}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="version-history-content"
      >
        History
        {entries.length > 0 && (
          <span className={styles.count}>({entries.length})</span>
        )}
      </button>

      {open && (
        <div id="version-history-content" className={styles.content}>
          {entries.length === 0 ? (
            <p className={styles.empty}>No version history yet.</p>
          ) : (
            <div className={styles.list}>
              {entries.map((entry) => (
                <div key={entry.id} className={styles.entry}>
                  <div className={styles.entryHeader}>
                    <span className={styles.changedBy}>
                      {entry.changed_by.name}
                    </span>
                    <Badge variant={getSourceVariant(entry.changed_by.source)}>
                      {entry.changed_by.source}
                    </Badge>
                    <span className={styles.timestamp}>
                      {formatRelativeTime(entry.changed_at)}
                    </span>
                  </div>
                  {entry.section && (
                    <span className={styles.section}>
                      {entry.section.replace(/_/g, ' ')}
                    </span>
                  )}
                  <div className={styles.diff}>
                    {entry.old_content &&
                      Object.keys(entry.old_content).length > 0 && (
                        <div className={styles.removed}>
                          {proseMirrorToPlainText(entry.old_content) ||
                            '(empty)'}
                        </div>
                      )}
                    {entry.new_content &&
                      Object.keys(entry.new_content).length > 0 && (
                        <div className={styles.added}>
                          {proseMirrorToPlainText(entry.new_content) ||
                            '(empty)'}
                        </div>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
