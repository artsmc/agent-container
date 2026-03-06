import styles from './tasks.module.scss'

export const metadata = {
  title: 'Tasks — iExcel',
}

/**
 * Tasks list page — shows tasks across all assigned clients.
 */
export default function TasksPage() {
  return (
    <div className={styles.page} data-testid="tasks-page">
      <h1 className={styles.pageTitle}>Tasks</h1>
      <div className={styles.emptyState}>
        <p>No tasks found. Tasks will appear here when agendas are processed for your assigned clients.</p>
      </div>
    </div>
  )
}
