import styles from './agendas.module.scss'

export const metadata = {
  title: 'Agendas — iExcel',
}

/**
 * Agendas list page — shows agendas across all assigned clients.
 */
export default function AgendasPage() {
  return (
    <div className={styles.page} data-testid="agendas-page">
      <h1 className={styles.pageTitle}>Agendas</h1>
      <div className={styles.emptyState}>
        <p>No agendas found. Agendas will appear here when created for your assigned clients.</p>
      </div>
    </div>
  )
}
