import styles from './DashboardSkeleton.module.scss';

/**
 * Animated shimmer placeholder matching the four-column layout of
 * a pending approval row.
 */
export function ApprovalRowSkeleton() {
  return (
    <div className={styles.approvalRowSkeleton} aria-hidden="true">
      <div className={styles.approvalRowSkeletonId} />
      <div className={styles.approvalRowSkeletonTitle} />
      <div className={styles.approvalRowSkeletonClient} />
      <div className={styles.approvalRowSkeletonTime} />
    </div>
  );
}
