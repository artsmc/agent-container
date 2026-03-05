import {
  ClientCardsSkeleton,
  ApprovalsPanelSkeleton,
  ActivityFeedSkeleton,
} from '@/components/DashboardSkeleton';
import styles from './dashboard.module.scss';

/**
 * Route-level loading fallback for the dashboard.
 *
 * Provides an instant visual response during full-page navigation
 * before any Suspense boundaries resolve.
 */
export default function DashboardLoading() {
  return (
    <div className={styles.dashboard}>
      <section className={styles.clientGrid}>
        <div className={styles.pageTitle}>
          <h1>Dashboard</h1>
        </div>
        <ClientCardsSkeleton count={6} />
      </section>

      <aside className={styles.panels}>
        <ApprovalsPanelSkeleton count={5} />
        <ActivityFeedSkeleton count={5} />
      </aside>
    </div>
  );
}
