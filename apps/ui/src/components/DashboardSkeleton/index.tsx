import { ClientCardSkeleton } from './ClientCardSkeleton';
import { ApprovalRowSkeleton } from './ApprovalRowSkeleton';
import { ActivityEntrySkeleton } from './ActivityEntrySkeleton';
import styles from './DashboardSkeleton.module.scss';

export { ClientCardSkeleton } from './ClientCardSkeleton';
export { ApprovalRowSkeleton } from './ApprovalRowSkeleton';
export { ActivityEntrySkeleton } from './ActivityEntrySkeleton';

/**
 * Wrapper that renders N client card skeletons in a responsive grid.
 */
export function ClientCardsSkeleton({ count }: { count: number }) {
  return (
    <div
      className={styles.cardsGrid}
      aria-busy="true"
      aria-label="Loading clients"
    >
      {Array.from({ length: count }, (_, i) => (
        <ClientCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Wrapper that renders N approval row skeletons inside a panel shell.
 */
export function ApprovalsPanelSkeleton({ count }: { count: number }) {
  return (
    <div
      className={styles.approvalsPanel}
      aria-busy="true"
      aria-label="Loading pending approvals"
    >
      <div className={styles.approvalsPanelTitle} />
      {Array.from({ length: count }, (_, i) => (
        <ApprovalRowSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Wrapper that renders N activity entry skeletons inside a panel shell.
 */
export function ActivityFeedSkeleton({ count }: { count: number }) {
  return (
    <div
      className={styles.feedPanel}
      aria-busy="true"
      aria-label="Loading activity feed"
    >
      <div className={styles.feedPanelTitle} />
      {Array.from({ length: count }, (_, i) => (
        <ActivityEntrySkeleton key={i} />
      ))}
    </div>
  );
}
