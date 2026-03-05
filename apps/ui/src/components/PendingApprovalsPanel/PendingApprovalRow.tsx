'use client';

import { useRouter } from 'next/navigation';
import type { DashboardDraftTask } from '@/types/dashboard';
import { formatEstimatedTime } from '@/lib/dashboard/formatEstimatedTime';
import styles from './PendingApprovalsPanel.module.scss';

export interface PendingApprovalRowProps {
  task: DashboardDraftTask;
}

const MAX_TITLE_LENGTH = 60;

/**
 * A clickable row in the pending approvals panel.
 *
 * Client Component because it uses `useRouter` for click-to-navigate
 * and keyboard (Enter) navigation.
 */
export function PendingApprovalRow({ task }: PendingApprovalRowProps) {
  const router = useRouter();
  const href = `/clients/${task.clientId}/tasks?task=${task.shortId}`;

  const truncatedTitle =
    task.title.length > MAX_TITLE_LENGTH
      ? `${task.title.slice(0, MAX_TITLE_LENGTH)}...`
      : task.title;

  const handleNavigate = () => router.push(href);

  return (
    <tr
      className={styles.row}
      onClick={handleNavigate}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleNavigate();
      }}
      aria-label={`Review task ${task.shortId}`}
      data-testid="approval-row"
    >
      <td className={styles.cellId}>
        <span className={styles.shortId} aria-label={`Task ${task.shortId}`}>
          {task.shortId}
        </span>
      </td>
      <td className={styles.cellTitle} title={task.title}>
        {truncatedTitle}
      </td>
      <td className={styles.cellClient}>{task.clientName}</td>
      <td className={styles.cellTime}>
        {formatEstimatedTime(task.estimatedMinutes)}
      </td>
    </tr>
  );
}
