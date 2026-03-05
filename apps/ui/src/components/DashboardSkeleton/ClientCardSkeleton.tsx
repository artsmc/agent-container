import styles from './DashboardSkeleton.module.scss';

/**
 * Animated shimmer placeholder matching the dimensions of a real ClientCard.
 */
export function ClientCardSkeleton() {
  return (
    <div className={styles.cardSkeleton} aria-hidden="true">
      <div className={styles.cardSkeletonTitle} />
      <div className={styles.cardSkeletonRow}>
        <div className={styles.cardSkeletonBadge} />
        <div className={styles.cardSkeletonBadge} />
      </div>
      <div className={styles.cardSkeletonText} />
      <div className={styles.cardSkeletonActions}>
        <div className={styles.cardSkeletonButton} />
        <div className={styles.cardSkeletonButton} />
      </div>
    </div>
  );
}
