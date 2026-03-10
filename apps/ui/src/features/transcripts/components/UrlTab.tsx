'use client';

import { useState } from 'react';
import { MEETING_TYPE_OPTIONS } from '../types';
import { importFromUrl } from '../hooks/use-transcript-api';
import styles from './TranscriptSubmitPage.module.scss';

export function UrlTab() {
  const [url, setUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [meetingType, setMeetingType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await importFromUrl(
        url.trim(),
        clientId.trim() || undefined,
        meetingType || undefined
      );
      setSuccess(
        `Transcript imported successfully (ID: ${result.transcriptId}). ` +
          `Platform: ${result.detectedPlatform ?? 'auto-detected'}.`
      );
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.inputGroup}>
        <label className={styles.inputLabel} htmlFor="url-input">
          Recording URL
        </label>
        <input
          id="url-input"
          type="url"
          className={styles.input}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://app.fireflies.ai/view/... or https://grain.com/share/..."
        />
        <span className={styles.inputHint}>
          Paste a Fireflies or Grain recording URL. The platform will be
          auto-detected.
        </span>
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.inputLabel} htmlFor="url-client-id">
          Client ID (optional)
        </label>
        <input
          id="url-client-id"
          type="text"
          className={styles.input}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="UUID of the client (optional)"
        />
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.inputLabel} htmlFor="url-meeting-type">
          Meeting Type (optional)
        </label>
        <select
          id="url-meeting-type"
          className={styles.select}
          value={meetingType}
          onChange={(e) => setMeetingType(e.target.value)}
        >
          <option value="">-- Auto --</option>
          {MEETING_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <button
        type="button"
        className={styles.primaryButton}
        onClick={handleSubmit}
        disabled={submitting || !url.trim()}
      >
        {submitting ? 'Importing...' : 'Import'}
      </button>
    </div>
  );
}
