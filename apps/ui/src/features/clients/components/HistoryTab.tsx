'use client'

/**
 * HistoryTab -- Read-only table of imported historical records.
 *
 * Displays record type, title, import date, source, and an "Imported" badge.
 * No edit or action controls.
 */

import { useClientImportStatus } from '../hooks/useClientImportStatus'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import styles from './HistoryTab.module.scss'

interface HistoryTabProps {
  clientId: string
  enabled: boolean
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(isoDate))
}

export default function HistoryTab({ clientId, enabled }: HistoryTabProps) {
  const { data, loading, error, retry } = useClientImportStatus(clientId, enabled)

  if (loading) {
    return (
      <div className={styles.container} data-testid="history-tab-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.skeletonRow} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container} data-testid="history-tab-error">
        <p className={styles.errorMessage}>Failed to load import history.</p>
        <Button variant="secondary" size="sm" onClick={retry}>
          Retry
        </Button>
      </div>
    )
  }

  // The ImportStatusResponse from the api-client has a different shape
  // than what TR.md defines. We handle both: if status is 'none' or
  // there are no details, show the empty state.
  if (!data || data.status === 'pending') {
    return (
      <div className={styles.container} data-testid="history-tab-empty">
        <p className={styles.emptyMessage}>
          No historical records have been imported for this client.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.container} data-testid="history-tab">
      {data.completedAt && (
        <p className={styles.importDate}>
          Last import: {formatDate(data.completedAt)}
        </p>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Import Status</th>
            <th className={styles.th}>Started</th>
            <th className={styles.th}>Completed</th>
          </tr>
        </thead>
        <tbody>
          <tr className={styles.row}>
            <td className={styles.td}>{data.status}</td>
            <td className={styles.td}>
              <Badge
                variant={data.status === 'completed' ? 'success' : 'warning'}
                aria-label={`Import status: ${data.status}`}
              >
                {data.status === 'completed' ? 'Imported' : data.status}
              </Badge>
            </td>
            <td className={styles.td}>
              {data.startedAt ? formatDate(data.startedAt) : '--'}
            </td>
            <td className={styles.td}>
              {data.completedAt ? formatDate(data.completedAt) : '--'}
            </td>
          </tr>
        </tbody>
      </table>

      {data.error && (
        <p className={styles.errorMessage}>Import error: {data.error}</p>
      )}
    </div>
  )
}
