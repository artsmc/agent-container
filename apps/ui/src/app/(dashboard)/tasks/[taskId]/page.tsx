import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getApiClient } from '@/lib/dashboard/getApiClient'
import { ApiClientError } from '@iexcel/api-client'
import { Badge } from '@/components/Badge'
import type { BadgeProps } from '@/components/Badge'
import styles from './taskDetail.module.scss'

interface PageProps {
  params: Promise<{ taskId: string }>
}

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  draft: 'default',
  approved: 'success',
  rejected: 'danger',
  pushed: 'info',
  completed: 'primary',
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso))
}

function formatTime(hhMm: string): string {
  const [h, m] = hhMm.split(':').map(Number)
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  if (m) return `${m}m`
  return hhMm
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { taskId } = await params

  try {
    const apiClient = getApiClient()
    const raw = (await apiClient.getTask(taskId)) as unknown as Record<string, unknown>

    const shortId = (raw.shortId ?? raw.short_id ?? '') as string
    const title = raw.title as string
    const status = (raw.status ?? 'draft') as string
    const assignee = (raw.assignee ?? null) as string | null
    const estimatedTime = (raw.estimatedTime ?? raw.estimated_time ?? null) as string | null
    const scrumStage = (raw.scrumStage ?? raw.scrum_stage ?? null) as string | null
    const clientId = (raw.clientId ?? raw.client_id ?? '') as string
    const createdAt = (raw.createdAt ?? raw.created_at ?? '') as string
    const description = (raw.description ?? {}) as Record<string, unknown>
    const taskContext = (description.taskContext ?? '') as string
    const additionalContext = (description.additionalContext ?? '') as string
    const requirements = (description.requirements ?? []) as string[]

    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <Link href={`/clients/${clientId}?tab=tasks`} className={styles.backLink}>
            &larr; Back to tasks
          </Link>
          <div className={styles.titleRow}>
            <span className={styles.shortId}>{shortId}</span>
            <h1 className={styles.title}>{title}</h1>
          </div>
          <div className={styles.meta}>
            <Badge variant={STATUS_VARIANT[status] ?? 'default'}>{status}</Badge>
            {assignee && <span className={styles.metaItem}>Assignee: {assignee}</span>}
            {estimatedTime && (
              <span className={styles.metaItem}>Est: {formatTime(estimatedTime)}</span>
            )}
            {scrumStage && <span className={styles.metaItem}>Stage: {scrumStage}</span>}
            {createdAt && (
              <span className={styles.metaItem}>Created: {formatDate(createdAt)}</span>
            )}
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Context</h2>
          <p className={styles.sectionBody}>{taskContext || 'No context provided.'}</p>
        </div>

        {additionalContext && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Additional Context</h2>
            <p className={styles.sectionBody}>{additionalContext}</p>
          </div>
        )}

        {requirements.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Requirements</h2>
            <ul className={styles.requirementsList}>
              {requirements.map((req, i) => (
                <li key={i} className={styles.requirementItem}>{req}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  } catch (err) {
    if (err instanceof ApiClientError && err.statusCode === 404) {
      notFound()
    }
    throw err
  }
}
