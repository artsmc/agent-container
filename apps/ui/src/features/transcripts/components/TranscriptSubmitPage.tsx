'use client';

import { useState, useEffect, useCallback } from 'react';
import type { IntegrationInfo } from '../../integrations/types';
import { fetchIntegrations } from '../hooks/use-transcript-api';
import { PlatformTab } from './PlatformTab';
import { UrlTab } from './UrlTab';
import { PasteTextTab } from './PasteTextTab';
import styles from './TranscriptSubmitPage.module.scss';

type Tab = 'platform' | 'url' | 'paste';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'platform', label: 'From Platform' },
  { id: 'url', label: 'From URL' },
  { id: 'paste', label: 'Paste Text' },
];

export function TranscriptSubmitPage() {
  const [activeTab, setActiveTab] = useState<Tab>('platform');
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);

  const loadIntegrations = useCallback(async () => {
    setLoadingIntegrations(true);
    try {
      const data = await fetchIntegrations();
      setIntegrations(data);
    } catch {
      // Integrations may fail if not configured; the platform tab
      // will show an empty state.
      setIntegrations([]);
    } finally {
      setLoadingIntegrations(false);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  return (
    <div className={styles.container} data-testid="transcript-submit-page">
      <div className={styles.header}>
        <h1 className={styles.title}>New Transcript</h1>
        <p className={styles.subtitle}>
          Import a transcript from a connected platform, paste a URL, or paste
          the raw text.
        </p>
      </div>

      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel}>
        {activeTab === 'platform' && (
          loadingIntegrations ? (
            <div className={styles.loadingState}>Loading integrations...</div>
          ) : (
            <PlatformTab integrations={integrations} />
          )
        )}
        {activeTab === 'url' && <UrlTab />}
        {activeTab === 'paste' && <PasteTextTab />}
      </div>
    </div>
  );
}
