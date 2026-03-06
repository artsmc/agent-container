import Link from 'next/link'
import styles from './workflows.module.scss'

export const metadata = {
  title: 'Workflows — iExcel',
}

/**
 * Workflows list page — shows available workflow templates.
 */
export default function WorkflowsPage() {
  return (
    <div className={styles.page} data-testid="workflows-page">
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>Workflows</h1>
        <Link href="/workflows/new" className={styles.createLink}>
          New Workflow
        </Link>
      </div>
      <div className={styles.emptyState}>
        <p>No workflows yet. Create your first workflow to automate client processes.</p>
      </div>
    </div>
  )
}
