'use client'

/**
 * AgendaCard -- Displays a single agenda summary with cycle dates,
 * status badge, last-edited info, and an Edit link.
 */

import Link from 'next/link'
import type { Agenda } from '@iexcel/shared-types'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import type { BadgeProps } from '@/components/Badge'
import { formatCycleDates } from '@/utils/formatCycleDates'
import { formatRelativeTime } from '@/utils/formatRelativeTime'
import styles from './AgendaCard.module.scss'

interface AgendaCardProps {
  agenda: Agenda
}

const AGENDA_STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  draft: 'default',
  in_review: 'info',
  finalized: 'success',
  shared: 'primary',
}

function formatAgendaStatus(status: string): string {
  return status.replace(/_/g, ' ')
}

export default function AgendaCard({ agenda }: AgendaCardProps) {
  return (
    <Card elevation="flat" className={styles.card}>
      <div className={styles.top}>
        <span className={styles.shortId}>{agenda.shortId}</span>
        <Badge
          variant={AGENDA_STATUS_VARIANT[agenda.status] ?? 'default'}
          aria-label={`Status: ${formatAgendaStatus(agenda.status)}`}
        >
          {formatAgendaStatus(agenda.status)}
        </Badge>
      </div>

      <p className={styles.dates}>
        {formatCycleDates(agenda.cycleStart, agenda.cycleEnd)}
      </p>

      <p className={styles.lastEdited}>
        Updated {formatRelativeTime(agenda.updatedAt)}
      </p>

      <div className={styles.actions}>
        <Link href={`/agendas/${agenda.shortId}`} className={styles.editLink}>
          Edit
        </Link>
      </div>
    </Card>
  )
}
