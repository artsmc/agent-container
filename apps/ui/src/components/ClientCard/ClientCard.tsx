import Link from 'next/link';
import type { DashboardClient, DashboardClientStatus, AgendaStatus } from '@/types/dashboard';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import type { BadgeProps } from '@/components/Badge';
import styles from './ClientCard.module.scss';

export interface ClientCardProps {
  client: DashboardClient;
  status: DashboardClientStatus | null;
}

/** Maps agenda status values to Badge variant. */
const AGENDA_STATUS_VARIANT: Record<AgendaStatus, BadgeProps['variant']> = {
  draft: 'default',
  in_review: 'warning',
  finalized: 'success',
  shared: 'info',
};

/** Formats an agenda status enum into a human-readable label. */
function formatAgendaLabel(status: AgendaStatus): string {
  return status.replace(/_/g, ' ');
}

/** Formats an ISO date to "Mar 10" style using UTC to avoid timezone shift. */
function formatCallDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(isoDate));
}

export default function ClientCard({ client, status }: ClientCardProps) {
  const hasPending = status !== null && status.pendingDraftCount > 0;

  return (
    <Card className={styles.card} elevation="raised">
      <div className={styles.header}>
        <h3 className={styles.clientName} title={client.name}>
          {client.name}
        </h3>
        <div className={styles.badges}>
          {status !== null && hasPending && (
            <Badge
              variant="danger"
              aria-label={`${status.pendingDraftCount} pending drafts`}
            >
              {status.pendingDraftCount}
            </Badge>
          )}
          {status !== null && status.agendaStatus !== null && (
            <Badge
              variant={AGENDA_STATUS_VARIANT[status.agendaStatus]}
              aria-label={`Agenda status: ${formatAgendaLabel(status.agendaStatus)}`}
            >
              {formatAgendaLabel(status.agendaStatus)}
            </Badge>
          )}
        </div>
      </div>

      <div className={styles.statusRow}>
        <span className={styles.statusLabel}>Next call:</span>
        {status !== null ? (
          status.nextCallDate ? (
            <span className={styles.statusValue}>
              {formatCallDate(status.nextCallDate)}
            </span>
          ) : (
            <span className={styles.statusDash}>No call scheduled</span>
          )
        ) : (
          <span className={styles.statusDash}>{'\u2014'}</span>
        )}
      </div>

      {status === null && (
        <div className={styles.errorIndicator} title="Status unavailable">
          <span aria-hidden="true">!</span>
          <span>Status unavailable</span>
        </div>
      )}

      <div className={styles.actions}>
        <Link
          href={`/clients/${client.id}/tasks`}
          className={styles.actionLink}
        >
          View Tasks
        </Link>
        <Link
          href={`/clients/${client.id}/agendas`}
          className={styles.actionLink}
        >
          View Agenda
        </Link>
      </div>
    </Card>
  );
}
