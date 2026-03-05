import styles from './DashboardSkeleton.module.scss';

/**
 * Animated shimmer placeholder matching the layout of a single
 * activity feed entry (avatar circle + two text lines).
 */
export function ActivityEntrySkeleton() {
  return (
    <div className={styles.activityEntrySkeleton} aria-hidden="true">
      <div className={styles.activityEntryAvatar} />
      <div className={styles.activityEntryContent}>
        <div className={styles.activityEntryLine1} />
        <div className={styles.activityEntryLine2} />
      </div>
    </div>
  );
}
