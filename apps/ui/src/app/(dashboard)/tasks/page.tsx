import Link from 'next/link'
import { Suspense } from 'react'
import Badge from '@/components/Badge/Badge'
import type { NormalizedTask } from '@iexcel/shared-types'
import { fetchAllTasks } from '@/lib/dashboard/fetchAllTasks'
import { parseIsoDurationToMinutes } from '@/lib/dashboard/parseIsoDuration'
import { formatEstimatedTime } from '@/lib/dashboard/formatEstimatedTime'
import styles from './tasks.module.scss'

export const metadata = {
  title: 'Tasks — iExcel',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatusVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

function getStatusBadge(status: string): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'draft':
      return { label: 'Draft', variant: 'default' }
    case 'approved':
      return { label: 'Approved', variant: 'success' }
    case 'pushed':
      return { label: 'Pushed', variant: 'info' }
    case 'rejected':
      return { label: 'Rejected', variant: 'danger' }
    case 'completed':
      return { label: 'Completed', variant: 'success' }
    default:
      return { label: status, variant: 'default' }
  }
}

function field<T>(task: NormalizedTask, camel: string, snake: string): T | undefined {
  const raw = task as unknown as Record<string, unknown>
  return (raw[camel] ?? raw[snake]) as T | undefined
}

function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  const date = new Date(isoString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  const date = new Date(isoString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Server Component: Task Table
// ---------------------------------------------------------------------------

async function TaskTable() {
  let result;

  try {
    result = await fetchAllTasks()
  } catch {
    return (
      <div className={styles.errorBanner} data-testid="tasks-error">
        Failed to load tasks. Please try refreshing the page.
      </div>
    )
  }

  const { tasks, hadErrors } = result

  if (tasks.length === 0) {
    return (
      <div className={styles.emptyState} data-testid="tasks-empty">
        <h2 className={styles.emptyTitle}>No tasks yet</h2>
        <p className={styles.emptyDescription}>
          Tasks are generated automatically when transcripts are processed.
          Submit a transcript with a client to get started.
        </p>
        <Link href="/transcripts/new" className={styles.actionButton}>
          New Transcript
        </Link>
      </div>
    )
  }

  return (
    <>
      {hadErrors && (
        <div className={styles.warningBanner} data-testid="tasks-partial-error">
          Some client data could not be loaded. Results may be incomplete.
        </div>
      )}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.tableHead}>
            <tr>
              <th className={styles.th}>ID</th>
              <th className={styles.th}>Title</th>
              <th className={styles.th}>Client</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Assignee</th>
              <th className={styles.th}>Est. Time</th>
              <th className={styles.th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const shortId = field<string>(task, 'shortId', 'short_id') ?? ''
              const clientId = field<string>(task, 'clientId', 'client_id') ?? ''
              const status = task.status as string
              const badge = getStatusBadge(status)
              const estimatedTimeIso = field<string>(task, 'estimatedTime', 'estimated_time') ?? null
              const minutes = parseIsoDurationToMinutes(estimatedTimeIso)
              const timeDisplay = formatEstimatedTime(minutes)
              const createdAt = field<string>(task, 'createdAt', 'created_at') ?? null

              return (
                <tr key={task.id} className={styles.tr}>
                  <td className={styles.td}>
                    <Link
                      href={`/clients/${clientId}?tab=tasks`}
                      className={styles.taskLink}
                    >
                      {shortId}
                    </Link>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.taskTitle}>{task.title}</span>
                  </td>
                  <td className={styles.td}>
                    <Link
                      href={`/clients/${clientId}`}
                      className={styles.clientLink}
                    >
                      {task.clientName}
                    </Link>
                  </td>
                  <td className={styles.td}>
                    <Badge variant={badge.variant} size="sm">
                      {badge.label}
                    </Badge>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.assignee}>
                      {task.assignee ?? '—'}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.time}>{timeDisplay}</span>
                  </td>
                  <td className={styles.td}>
                    {formatDateTime(createdAt)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <p className={styles.paginationInfo}>
          Showing {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TaskTableSkeleton() {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            <th className={styles.th}>ID</th>
            <th className={styles.th}>Title</th>
            <th className={styles.th}>Client</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Assignee</th>
            <th className={styles.th}>Est. Time</th>
            <th className={styles.th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, i) => (
            <tr key={i} className={`${styles.tr} ${styles.skeletonRow}`}>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '70px' }} />
              </td>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '200px' }} />
              </td>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '100px' }} />
              </td>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '60px' }} />
              </td>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '80px' }} />
              </td>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '50px' }} />
              </td>
              <td className={styles.td}>
                <div className={styles.skeletonCell} style={{ width: '120px' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function TasksPage() {
  return (
    <div className={styles.page} data-testid="tasks-page">
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Tasks</h1>
          <p className={styles.subtitle}>
            View and manage tasks across all your clients.
          </p>
        </div>
      </div>
      <Suspense fallback={<TaskTableSkeleton />}>
        <TaskTable />
      </Suspense>
    </div>
  )
}
