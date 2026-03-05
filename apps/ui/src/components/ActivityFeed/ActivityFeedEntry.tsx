'use client';

import type { DashboardAuditEntry } from '@/types/dashboard';
import { Avatar } from '@/components/Avatar';
import { formatActionDescription } from '@/lib/dashboard/formatActionDescription';
import { formatRelativeTime, formatAbsoluteTime } from '@/lib/dashboard/formatRelativeTime';
import styles from './ActivityFeed.module.scss';

export interface ActivityFeedEntryProps {
  entry: DashboardAuditEntry;
}

/**
 * A single activity feed entry.
 *
 * Client Component because it renders a tooltip on timestamp hover
 * (via the `title` attribute).
 */
export function ActivityFeedEntry({ entry }: ActivityFeedEntryProps) {
  const description = formatActionDescription(entry);
  const relativeTime = formatRelativeTime(entry.createdAt);
  const absoluteTime = formatAbsoluteTime(entry.createdAt);

  return (
    <div className={styles.entry} data-testid="activity-feed-entry">
      <Avatar
        src={entry.actor.avatarUrl ?? undefined}
        name={entry.actor.name}
        size="sm"
        alt={`${entry.actor.name}'s avatar`}
      />
      <div className={styles.entryContent}>
        <p className={styles.entryDescription}>
          <span className={styles.actorName}>{entry.actor.name}</span>
          {' '}
          {description}
        </p>
        <time
          className={styles.entryTimestamp}
          dateTime={entry.createdAt}
          title={absoluteTime}
        >
          {relativeTime}
        </time>
      </div>
    </div>
  );
}
