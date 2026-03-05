import type { SharedAgendaResponse } from '@iexcel/shared-types';
import { formatDate, formatDateRange } from '@/lib/dates';
import styles from './AgendaHeader.module.scss';

interface AgendaHeaderProps {
  agenda: Pick<
    SharedAgendaResponse,
    'short_id' | 'client_name' | 'cycle_start' | 'cycle_end' | 'finalized_at'
  >;
}

export function AgendaHeader({ agenda }: AgendaHeaderProps) {
  return (
    <header className={styles.header} data-testid="agenda-header">
      <div className={styles.shortId} data-testid="agenda-short-id">
        {agenda.short_id}
      </div>
      <h1 className={styles.clientName} data-testid="agenda-client-name">
        {agenda.client_name}
      </h1>
      <div className={styles.cyclePeriod} data-testid="agenda-cycle-period">
        {formatDateRange(agenda.cycle_start, agenda.cycle_end)}
      </div>
      <div className={styles.finalizedAt} data-testid="agenda-finalized-at">
        Finalized on {formatDate(agenda.finalized_at)}
      </div>
    </header>
  );
}
