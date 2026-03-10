import Link from 'next/link';
import { Suspense } from 'react';
import Badge from '@/components/Badge/Badge';
import { getApiClient } from '@/lib/dashboard/getApiClient';
import type { TranscriptListItem } from '@iexcel/shared-types';
import styles from './transcripts.module.scss';

export const metadata = {
  title: 'Transcripts — iExcel',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCallType(callType: string): string {
  return callType.replace(/_/g, ' ');
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type StatusVariant = 'success' | 'warning' | 'default' | 'info';

function getStatusBadge(transcript: TranscriptListItem): {
  label: string;
  variant: StatusVariant;
} {
  if (transcript.processed_at) {
    return { label: 'Processed', variant: 'success' };
  }
  if (transcript.is_imported) {
    return { label: 'Imported', variant: 'info' };
  }
  return { label: 'Pending', variant: 'warning' };
}

function formatPlatform(platform: string | null): string {
  if (!platform) return 'Manual';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

// ---------------------------------------------------------------------------
// Server Component: Transcript Table
// ---------------------------------------------------------------------------

async function TranscriptTable() {
  const apiClient = getApiClient();

  let data: TranscriptListItem[];
  let pagination: { page: number; per_page: number; total: number; total_pages: number };

  try {
    const response = await apiClient.listAllTranscripts({ page: 1, per_page: 50 });
    data = response.data;
    pagination = response.pagination;
  } catch {
    return (
      <div className={styles.errorBanner} data-testid="transcripts-error">
        Failed to load transcripts. Please try refreshing the page.
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={styles.emptyState} data-testid="transcripts-empty">
        <h2 className={styles.emptyTitle}>No transcripts yet</h2>
        <p className={styles.emptyDescription}>
          Submit your first meeting transcript to get started with automated
          task extraction and agenda generation.
        </p>
        <Link href="/transcripts/new" className={styles.newButton}>
          New Transcript
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.tableHead}>
            <tr>
              <th className={styles.th}>Date</th>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Client</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Source</th>
              <th className={styles.th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {data.map((transcript) => {
              const status = getStatusBadge(transcript);
              return (
                <tr key={transcript.id} className={styles.tr}>
                  <td className={styles.td}>
                    <Link
                      href={`/transcripts/${transcript.id}`}
                      className={styles.transcriptLink}
                    >
                      {formatDate(transcript.call_date)}
                    </Link>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.callType}>
                      {formatCallType(transcript.call_type)}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.clientName}>
                      {transcript.client_name ?? 'Unassigned'}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <Badge variant={status.variant} size="sm">
                      {status.label}
                    </Badge>
                  </td>
                  <td className={styles.td}>
                    {formatPlatform(transcript.source_platform)}
                  </td>
                  <td className={styles.td}>
                    {formatDateTime(transcript.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination.total_pages > 1 && (
        <div className={styles.pagination}>
          <p className={styles.paginationInfo}>
            Showing {data.length} of {pagination.total} transcripts
          </p>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TranscriptTableSkeleton() {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            <th className={styles.th}>Date</th>
            <th className={styles.th}>Type</th>
            <th className={styles.th}>Client</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Source</th>
            <th className={styles.th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }, (_, i) => (
            <tr key={i} className={`${styles.tr} ${styles.skeletonRow}`}>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '90px' }} />
              </td>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '80px' }} />
              </td>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '120px' }} />
              </td>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '70px' }} />
              </td>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '60px' }} />
              </td>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '130px' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function TranscriptsPage() {
  return (
    <div className={styles.page} data-testid="transcripts-page">
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Transcripts</h1>
          <p className={styles.subtitle}>
            View and manage your meeting transcripts.
          </p>
        </div>
        <Link href="/transcripts/new" className={styles.newButton}>
          New Transcript
        </Link>
      </div>
      <Suspense fallback={<TranscriptTableSkeleton />}>
        <TranscriptTable />
      </Suspense>
    </div>
  );
}
