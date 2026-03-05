'use client'

/**
 * AgendasTab -- Lists all agendas for a client as cards.
 *
 * Includes an informational note that agendas are created automatically.
 * No "New Agenda" button is provided.
 */

import { useClientAgendas } from '../hooks/useClientAgendas'
import { Button } from '@/components/Button'
import AgendaCard from './AgendaCard'
import styles from './AgendasTab.module.scss'

interface AgendasTabProps {
  clientId: string
  enabled: boolean
}

export default function AgendasTab({ clientId, enabled }: AgendasTabProps) {
  const { data, loading, error, retry } = useClientAgendas(clientId, enabled)

  if (loading) {
    return (
      <div className={styles.container} data-testid="agendas-tab-skeleton">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={styles.skeletonCard} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container} data-testid="agendas-tab-error">
        <p className={styles.errorMessage}>Failed to load agendas.</p>
        <Button variant="secondary" size="sm" onClick={retry}>
          Retry
        </Button>
      </div>
    )
  }

  const agendas = data?.data ?? []

  return (
    <div className={styles.container} data-testid="agendas-tab">
      <p className={styles.infoNote}>
        Agendas are created automatically by the intake workflow.
      </p>

      {agendas.length === 0 ? (
        <p className={styles.emptyMessage}>No agendas created yet.</p>
      ) : (
        <div className={styles.cardList}>
          {agendas.map((agenda) => (
            <AgendaCard key={agenda.id} agenda={agenda} />
          ))}
        </div>
      )}
    </div>
  )
}
