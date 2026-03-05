'use client'

/**
 * TranscriptsTab -- Read-only table of ingested transcripts.
 *
 * Columns: Call Date, Call Type, Processing Status.
 * No action buttons -- transcripts are ingested via workflow triggers.
 */

import { useClientTranscripts } from '../hooks/useClientTranscripts'
import { Badge } from '@/components/Badge'
import type { BadgeProps } from '@/components/Badge'
import { Button } from '@/components/Button'
import styles from './TranscriptsTab.module.scss'

interface TranscriptsTabProps {
  clientId: string
  enabled: boolean
}

function formatCallDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(isoDate))
}

function formatCallType(callType: string): string {
  return callType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getProcessingStatus(processedAt: string | null): { label: string; variant: BadgeProps['variant'] } {
  if (processedAt) {
    return { label: 'Processed', variant: 'success' }
  }
  return { label: 'Pending', variant: 'warning' }
}

export default function TranscriptsTab({ clientId, enabled }: TranscriptsTabProps) {
  const { data, loading, error, retry } = useClientTranscripts(clientId, enabled)

  if (loading) {
    return (
      <div className={styles.container} data-testid="transcripts-tab-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.skeletonRow} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container} data-testid="transcripts-tab-error">
        <p className={styles.errorMessage}>Failed to load transcripts.</p>
        <Button variant="secondary" size="sm" onClick={retry}>
          Retry
        </Button>
      </div>
    )
  }

  const transcripts = data?.data ?? []

  if (transcripts.length === 0) {
    return (
      <div className={styles.container} data-testid="transcripts-tab-empty">
        <p className={styles.emptyMessage}>No transcripts ingested yet.</p>
      </div>
    )
  }

  return (
    <div className={styles.container} data-testid="transcripts-tab">
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Call Date</th>
            <th className={styles.th}>Call Type</th>
            <th className={styles.th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {transcripts.map((transcript) => {
            const status = getProcessingStatus(transcript.processedAt)
            return (
              <tr key={transcript.id} className={styles.row}>
                <td className={styles.td}>{formatCallDate(transcript.callDate)}</td>
                <td className={styles.td}>{formatCallType(transcript.callType)}</td>
                <td className={styles.td}>
                  <Badge variant={status.variant} aria-label={`Status: ${status.label}`}>
                    {status.label}
                  </Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
