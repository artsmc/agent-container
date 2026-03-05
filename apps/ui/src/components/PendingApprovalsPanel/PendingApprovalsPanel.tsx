import { fetchClients } from '@/lib/dashboard/fetchClients';
import { fetchDraftTasks } from '@/lib/dashboard/fetchDraftTasks';
import { PendingApprovalRow } from './PendingApprovalRow';
import styles from './PendingApprovalsPanel.module.scss';

const MAX_VISIBLE_ROWS = 20;

/**
 * Async Server Component that aggregates draft tasks from all clients
 * and renders them in a scrollable panel.
 *
 * - Reuses `fetchClients()` (deduplicated via React `cache()`).
 * - Handles empty state, partial errors, and overflow truncation.
 */
export default async function PendingApprovalsPanel() {
  const clients = await fetchClients();
  const { tasks, hadErrors } = await fetchDraftTasks(clients);

  return (
    <div className={styles.panel} data-testid="pending-approvals-panel">
      <h2 className={styles.title}>Pending Approvals</h2>

      {hadErrors && (
        <div className={styles.warningBanner} role="alert" data-testid="partial-error-banner">
          Some clients could not be loaded. Showing partial results.
        </div>
      )}

      {tasks.length === 0 ? (
        <p className={styles.emptyState} data-testid="approvals-empty">
          No tasks pending approval. All caught up.
        </p>
      ) : (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr>
                  <th className={styles.thId}>ID</th>
                  <th className={styles.thTitle}>Title</th>
                  <th className={styles.thClient}>Client</th>
                  <th className={styles.thTime}>Est.</th>
                </tr>
              </thead>
              <tbody>
                {tasks.slice(0, MAX_VISIBLE_ROWS).map((task) => (
                  <PendingApprovalRow key={task.shortId} task={task} />
                ))}
              </tbody>
            </table>
          </div>

          {tasks.length > MAX_VISIBLE_ROWS && (
            <div className={styles.overflowFooter}>
              <a
                href="/tasks?status=draft"
                className={styles.overflowLink}
                data-testid="overflow-link"
              >
                View all {tasks.length} pending tasks
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
