'use client'

import { useRouter } from 'next/navigation'
import Card from '@/components/Card/Card'
import Badge from '@/components/Badge/Badge'
import Button from '@/components/Button/Button'
import type { AgendaSummary, UserRole } from '../types'
import { AgendaStatus } from '../types'
import {
  formatCycleDates,
  formatRelativeTime,
  getStatusBadgeVariant,
  formatStatus,
  canManageAgenda,
  isAgendaReadOnly,
} from '../utils'
import styles from './AgendaCard.module.scss'

interface AgendaCardProps {
  agenda: AgendaSummary
  userRole: UserRole
  onFinalize: (agenda: AgendaSummary) => void
  onShare: (agenda: AgendaSummary) => void
  onEmail: (agenda: AgendaSummary) => void
  error?: string | null
}

/**
 * Card component for the Agenda List screen.
 * Shows short ID, cycle dates, status badge, last edited info,
 * and quick action buttons (Edit, Finalize, Share, Email).
 */
export function AgendaCard({
  agenda,
  userRole,
  onFinalize,
  onShare,
  onEmail,
  error,
}: AgendaCardProps) {
  const router = useRouter()
  const isManager = canManageAgenda(userRole)
  const isFinalized =
    agenda.status === AgendaStatus.Finalized ||
    agenda.status === AgendaStatus.Shared

  return (
    <Card elevation="raised" className={styles.root}>
      <div className={styles.header}>
        <span className={styles.shortId}>{agenda.short_id}</span>
        <Badge variant={getStatusBadgeVariant(agenda.status)}>
          {formatStatus(agenda.status)}
        </Badge>
      </div>

      <div className={styles.meta}>
        <span className={styles.cycleDates}>
          {formatCycleDates(agenda.cycle_start, agenda.cycle_end)}
        </span>
        <span className={styles.editedBy}>
          Last edited by {agenda.last_edited_by.name} &middot;{' '}
          {formatRelativeTime(agenda.last_edited_at)}
        </span>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push(`/agendas/${agenda.short_id}`)}
        >
          Edit
        </Button>

        {isManager && !isFinalized && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onFinalize(agenda)}
          >
            Finalize
          </Button>
        )}

        {isManager && isFinalized && !isAgendaReadOnly(agenda.status) && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onShare(agenda)}
          >
            Share
          </Button>
        )}

        {isManager && agenda.status === AgendaStatus.Finalized && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onShare(agenda)}
            >
              Share
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onEmail(agenda)}
            >
              Email
            </Button>
          </>
        )}

        {isManager && agenda.status === AgendaStatus.Shared && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEmail(agenda)}
          >
            Email
          </Button>
        )}
      </div>
    </Card>
  )
}
