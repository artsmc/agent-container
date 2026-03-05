'use client'

/**
 * TasksSummaryTab -- Summary table of the 10 most recent tasks for a client.
 *
 * Shows short ID, title, status badge, and assignee avatar.
 * Includes "View all tasks" link when total exceeds 10 and a
 * "Review Tasks" primary action button.
 */

import Link from 'next/link'
import { useClientTasks } from '../hooks/useClientTasks'
import { Badge } from '@/components/Badge'
import type { BadgeProps } from '@/components/Badge'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import type { TaskStatus } from '@iexcel/shared-types'
import styles from './TasksSummaryTab.module.scss'

interface TasksSummaryTabProps {
  clientId: string
  enabled: boolean
}

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  draft: 'default',
  approved: 'success',
  rejected: 'danger',
  pushed: 'info',
  completed: 'primary',
}

function formatStatusLabel(status: TaskStatus | string): string {
  return status.replace(/_/g, ' ')
}

export default function TasksSummaryTab({ clientId, enabled }: TasksSummaryTabProps) {
  const { data, loading, error, retry } = useClientTasks(clientId, enabled)

  if (loading) {
    return (
      <div className={styles.container} data-testid="tasks-tab-skeleton">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.skeletonRow} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container} data-testid="tasks-tab-error">
        <p className={styles.errorMessage}>Failed to load tasks.</p>
        <Button variant="secondary" size="sm" onClick={retry}>
          Retry
        </Button>
      </div>
    )
  }

  if (!data || data.data.length === 0) {
    return (
      <div className={styles.container} data-testid="tasks-tab-empty">
        <p className={styles.emptyMessage}>No tasks for this client yet.</p>
      </div>
    )
  }

  const tasks = data.data
  const total = data.total

  return (
    <div className={styles.container} data-testid="tasks-tab">
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>ID</th>
            <th className={styles.th}>Title</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Assignee</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className={styles.row}>
              <td className={styles.td}>
                <Link
                  href={`/tasks/${task.shortId}`}
                  className={styles.shortId}
                >
                  {task.shortId}
                </Link>
              </td>
              <td className={styles.td}>
                <span className={styles.title} title={task.title}>
                  {task.title}
                </span>
              </td>
              <td className={styles.td}>
                <Badge
                  variant={STATUS_VARIANT[task.status] ?? 'default'}
                  aria-label={`Status: ${formatStatusLabel(task.status)}`}
                >
                  {formatStatusLabel(task.status)}
                </Badge>
              </td>
              <td className={styles.td}>
                {task.assignee ? (
                  <Avatar name={task.assignee} size="sm" />
                ) : (
                  <span className={styles.unassigned}>--</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.actions}>
        {total > 10 && (
          <Link
            href={`/clients/${clientId}/tasks`}
            className={styles.viewAllLink}
          >
            View all {total} tasks
          </Link>
        )}
        <Link href={`/clients/${clientId}/tasks`}>
          <Button variant="primary" size="md">
            Review Tasks
          </Button>
        </Link>
      </div>
    </div>
  )
}
