'use client';

import { useState, useCallback } from 'react';
import type { IntegrationInfo, PlatformConfig } from '../../types';
import {
  connectFireflies,
  disconnectPlatform,
  initGrainSession,
} from '../../hooks/use-integrations-api';
import styles from './IntegrationCard.module.scss';

interface IntegrationCardProps {
  platform: PlatformConfig;
  integration: IntegrationInfo | null;
  onUpdate: () => void;
}

export function IntegrationCard({
  platform,
  integration,
  onUpdate,
}: IntegrationCardProps) {
  const [showForm, setShowForm] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isConnected = integration?.status === 'connected';

  const handleConnect = useCallback(async () => {
    if (platform.authType === 'api_key') {
      setShowForm(true);
      return;
    }

    // OAuth flow (Grain)
    setSubmitting(true);
    setError(null);
    try {
      const session = await initGrainSession();
      window.location.href = session.browserUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start OAuth flow');
    } finally {
      setSubmitting(false);
    }
  }, [platform.authType]);

  const handleSubmitApiKey = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await connectFireflies(apiKey.trim(), label.trim() || undefined);
      setShowForm(false);
      setApiKey('');
      setLabel('');
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setSubmitting(false);
    }
  }, [apiKey, label, onUpdate]);

  const handleDisconnect = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await disconnectPlatform(platform.platform);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setSubmitting(false);
    }
  }, [platform.platform, onUpdate]);

  const handleCopyWebhook = useCallback(async () => {
    if (!integration?.webhookUrl) return;
    await navigator.clipboard.writeText(integration.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [integration?.webhookUrl]);

  const statusClass =
    integration?.status === 'connected'
      ? styles.connected
      : integration?.status === 'expired'
        ? styles.expired
        : styles.disconnected;

  return (
    <div className={styles.card} data-testid={`integration-card-${platform.platform}`}>
      <div className={styles.header}>
        <div className={styles.platformInfo}>
          <span className={styles.platformName}>{platform.name}</span>
          <span className={styles.platformDescription}>{platform.description}</span>
        </div>
        <span className={`${styles.statusBadge} ${statusClass}`}>
          {integration?.status ?? 'Not connected'}
        </span>
      </div>

      {integration && isConnected && (
        <div className={styles.details}>
          {integration.label && (
            <div>Label: {integration.label}</div>
          )}
          <div>
            Connected: {new Date(integration.createdAt).toLocaleDateString()}
          </div>
          {integration.lastSyncAt && (
            <div>
              Last sync: {new Date(integration.lastSyncAt).toLocaleString()}
            </div>
          )}
          {integration.webhookUrl && (
            <div className={styles.webhookRow}>
              <span className={styles.webhookLabel}>Webhook URL:</span>
              <span className={styles.webhookUrl}>{integration.webhookUrl}</span>
              <button
                type="button"
                className={styles.copyButton}
                onClick={handleCopyWebhook}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}

      {showForm && platform.authType === 'api_key' && (
        <div className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel} htmlFor={`${platform.platform}-api-key`}>
              API Key
            </label>
            <input
              id={`${platform.platform}-api-key`}
              type="password"
              className={styles.input}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key"
              autoComplete="off"
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel} htmlFor={`${platform.platform}-label`}>
              Label (optional)
            </label>
            <input
              id={`${platform.platform}-label`}
              type="text"
              className={styles.input}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., My Fireflies Account"
            />
          </div>
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.connectButton}
              onClick={handleSubmitApiKey}
              disabled={submitting}
            >
              {submitting ? 'Connecting...' : 'Save'}
            </button>
            <button
              type="button"
              className={styles.disconnectButton}
              onClick={() => {
                setShowForm(false);
                setApiKey('');
                setError(null);
              }}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        {!isConnected && !showForm && (
          <button
            type="button"
            className={styles.connectButton}
            onClick={handleConnect}
            disabled={submitting}
          >
            {submitting ? 'Connecting...' : 'Connect'}
          </button>
        )}
        {isConnected && (
          <>
            <button
              type="button"
              className={styles.connectButton}
              onClick={handleConnect}
              disabled={submitting}
            >
              Reconnect
            </button>
            <button
              type="button"
              className={styles.disconnectButton}
              onClick={handleDisconnect}
              disabled={submitting}
            >
              {submitting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
