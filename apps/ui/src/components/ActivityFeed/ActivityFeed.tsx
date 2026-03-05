import { fetchAuditLog } from '@/lib/dashboard/fetchAuditLog';
import { ActivityFeedEntry } from './ActivityFeedEntry';
import styles from './ActivityFeed.module.scss';

/**
 * Async Server Component that fetches the recent audit log and
 * renders a chronological activity feed.
 *
 * Handles error and empty states independently of other dashboard sections.
 */
export default async function ActivityFeed() {
  let entries;

  try {
    entries = await fetchAuditLog();
  } catch {
    return (
      <div className={styles.panel} data-testid="activity-feed-error">
        <h2 className={styles.title}>Recent Activity</h2>
        <p className={styles.errorState}>Activity feed unavailable.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel} data-testid="activity-feed">
      <h2 className={styles.title}>Recent Activity</h2>

      {entries.length === 0 ? (
        <p className={styles.emptyState} data-testid="activity-feed-empty">
          No recent activity.
        </p>
      ) : (
        <div className={styles.entries}>
          {entries.map((entry) => (
            <ActivityFeedEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
