'use client';

import { useState, useEffect, useCallback } from 'react';
import type { IntegrationInfo } from '../types';
import { PLATFORMS } from '../types';
import { fetchIntegrations } from '../hooks/use-integrations-api';
import { IntegrationCard } from './IntegrationCard';
import styles from './IntegrationsPage.module.scss';

export function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIntegrations();
      setIntegrations(data);
    } catch {
      setError('Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const getIntegrationForPlatform = (platform: string): IntegrationInfo | null => {
    return (
      integrations.find(
        (i) => i.platform === platform && i.status !== 'disconnected'
      ) ?? null
    );
  };

  return (
    <div className={styles.container} data-testid="integrations-page">
      <div className={styles.header}>
        <h1 className={styles.title}>Integrations</h1>
        <p className={styles.subtitle}>
          Connect your meeting platforms to automatically ingest and process transcripts.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading integrations...</div>
      ) : (
        <div className={styles.grid}>
          {PLATFORMS.map((platform) => (
            <IntegrationCard
              key={platform.platform}
              platform={platform}
              integration={getIntegrationForPlatform(platform.platform)}
              onUpdate={loadIntegrations}
            />
          ))}
        </div>
      )}
    </div>
  );
}
