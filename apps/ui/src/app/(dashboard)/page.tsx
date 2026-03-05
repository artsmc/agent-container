import { Suspense } from 'react';
import { ClientCardsGrid } from '@/components/ClientCardsGrid';
import { PendingApprovalsPanel } from '@/components/PendingApprovalsPanel';
import { ActivityFeed } from '@/components/ActivityFeed';
import {
  ClientCardsSkeleton,
  ApprovalsPanelSkeleton,
  ActivityFeedSkeleton,
} from '@/components/DashboardSkeleton';
import styles from './dashboard.module.scss';

/**
 * Dashboard page -- the root route `/`.
 *
 * Composed of three independent sections, each wrapped in its own
 * Suspense boundary so they stream to the client independently.
 */
export default function DashboardPage() {
  return (
    <div className={styles.dashboard} data-testid="dashboard-page">
      <section className={styles.clientGrid}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
        <Suspense fallback={<ClientCardsSkeleton count={6} />}>
          <ClientCardsGrid />
        </Suspense>
      </section>

      <aside className={styles.panels}>
        <Suspense fallback={<ApprovalsPanelSkeleton count={5} />}>
          <PendingApprovalsPanel />
        </Suspense>

        <Suspense fallback={<ActivityFeedSkeleton count={5} />}>
          <ActivityFeed />
        </Suspense>
      </aside>
    </div>
  );
}
