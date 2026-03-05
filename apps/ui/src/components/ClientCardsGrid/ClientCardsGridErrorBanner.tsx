'use client';

import { useRouter } from 'next/navigation';
import styles from './ClientCardsGrid.module.scss';

/**
 * Error banner shown when the GET /clients call fails.
 * Uses `'use client'` because it calls `useRouter().refresh()`.
 */
export function ClientCardsGridErrorBanner() {
  const router = useRouter();

  return (
    <div className={styles.errorBanner} role="alert" data-testid="client-grid-error">
      <p>Could not load clients. Try refreshing the page.</p>
      <button
        type="button"
        className={styles.retryButton}
        onClick={() => router.refresh()}
      >
        Retry
      </button>
    </div>
  );
}
