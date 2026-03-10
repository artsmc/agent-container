'use client';

import { useState, useEffect, useCallback } from 'react';
import type { IntegrationInfo } from '../../integrations/types';
import type { PlatformRecording } from '../types';
import {
  fetchAvailableRecordings,
  importFromPlatform,
} from '../hooks/use-transcript-api';
import styles from './TranscriptSubmitPage.module.scss';

interface PlatformTabProps {
  integrations: IntegrationInfo[];
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function PlatformTab({ integrations }: PlatformTabProps) {
  const connectedPlatforms = integrations.filter(
    (i) => i.status === 'connected'
  );

  const [selectedPlatform, setSelectedPlatform] = useState<string>(
    connectedPlatforms[0]?.platform ?? ''
  );
  const [recordings, setRecordings] = useState<PlatformRecording[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadRecordings = useCallback(async (platform: string) => {
    if (!platform) return;
    setLoading(true);
    setError(null);
    setRecordings([]);
    setSelectedIds(new Set());
    try {
      const data = await fetchAvailableRecordings(platform);
      setRecordings(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load recordings'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPlatform) {
      loadRecordings(selectedPlatform);
    }
  }, [selectedPlatform, loadRecordings]);

  const toggleRecording = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === recordings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recordings.map((r) => r.id)));
    }
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;

    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const results = await importFromPlatform(
        selectedPlatform,
        Array.from(selectedIds)
      );
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      if (failCount === 0) {
        setSuccess(`Successfully imported ${successCount} transcript(s).`);
      } else {
        setSuccess(
          `Imported ${successCount} transcript(s). ${failCount} failed.`
        );
      }
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (connectedPlatforms.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No platforms connected.</p>
        <p>
          Go to <a href="/integrations">Integrations</a> to connect Fireflies
          or Grain.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.inputGroup}>
        <label className={styles.inputLabel} htmlFor="platform-select">
          Platform
        </label>
        <select
          id="platform-select"
          className={styles.select}
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value)}
        >
          {connectedPlatforms.map((i) => (
            <option key={i.platform} value={i.platform}>
              {i.platform === 'fireflies' ? 'Fireflies.ai' : 'Grain'}
              {i.label ? ` (${i.label})` : ''}
            </option>
          ))}
        </select>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {loading ? (
        <div className={styles.loadingState}>Loading recordings...</div>
      ) : recordings.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No recordings found on this platform.</p>
        </div>
      ) : (
        <>
          <div className={styles.recordingsHeader}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={selectedIds.size === recordings.length}
                onChange={toggleAll}
              />
              Select all ({recordings.length})
            </label>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleImport}
              disabled={importing || selectedIds.size === 0}
            >
              {importing
                ? 'Importing...'
                : `Import Selected (${selectedIds.size})`}
            </button>
          </div>

          <div className={styles.recordingsList}>
            {recordings.map((recording) => (
              <label
                key={recording.id}
                className={`${styles.recordingRow} ${
                  selectedIds.has(recording.id) ? styles.recordingRowSelected : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(recording.id)}
                  onChange={() => toggleRecording(recording.id)}
                />
                <div className={styles.recordingInfo}>
                  <span className={styles.recordingTitle}>
                    {recording.title}
                  </span>
                  <span className={styles.recordingMeta}>
                    {new Date(recording.date).toLocaleDateString()} &middot;{' '}
                    {formatDuration(recording.durationSeconds)}
                    {recording.participants.length > 0 && (
                      <> &middot; {recording.participants.join(', ')}</>
                    )}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
