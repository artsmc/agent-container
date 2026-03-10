'use client';

import { useState } from 'react';
import { MEETING_TYPE_OPTIONS } from '../types';
import { submitRawTranscript } from '../hooks/use-transcript-api';
import styles from './TranscriptSubmitPage.module.scss';

export function PasteTextTab() {
  const [rawText, setRawText] = useState('');
  const [clientId, setClientId] = useState('');
  const [meetingType, setMeetingType] = useState<string>('client_call');
  const [callDate, setCallDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!rawText.trim()) {
      setError('Please paste the transcript text');
      return;
    }
    if (rawText.trim().length < 50) {
      setError('Transcript text must be at least 50 characters');
      return;
    }
    if (!clientId.trim()) {
      setError('Client ID is required');
      return;
    }
    if (!meetingType) {
      setError('Meeting type is required');
      return;
    }
    if (!callDate) {
      setError('Call date is required');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await submitRawTranscript(
        rawText.trim(),
        clientId.trim(),
        meetingType,
        callDate
      );
      setSuccess(
        `Transcript submitted successfully (ID: ${result.transcriptId}). ` +
          `Format: ${result.format}. Enrichment: ${result.enrichmentStatus}.`
      );
      setRawText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.inputGroup}>
        <label className={styles.inputLabel} htmlFor="paste-client-id">
          Client ID
        </label>
        <input
          id="paste-client-id"
          type="text"
          className={styles.input}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="UUID of the client"
        />
      </div>

      <div className={styles.formRow}>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel} htmlFor="paste-meeting-type">
            Meeting Type
          </label>
          <select
            id="paste-meeting-type"
            className={styles.select}
            value={meetingType}
            onChange={(e) => setMeetingType(e.target.value)}
          >
            {MEETING_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel} htmlFor="paste-call-date">
            Call Date
          </label>
          <input
            id="paste-call-date"
            type="date"
            className={styles.input}
            value={callDate}
            onChange={(e) => setCallDate(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.inputLabel} htmlFor="paste-textarea">
          Transcript Text
        </label>
        <textarea
          id="paste-textarea"
          className={styles.textarea}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste your transcript here...&#10;&#10;Supported formats:&#10;- SRT (subtitles with timestamps)&#10;- Turn-based (**Speaker**: text)&#10;- Raw text"
          rows={16}
        />
        <span className={styles.inputHint}>
          {rawText.length > 0 ? `${rawText.length} characters` : 'Minimum 50 characters'}
        </span>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <button
        type="button"
        className={styles.primaryButton}
        onClick={handleSubmit}
        disabled={submitting || rawText.trim().length < 50}
      >
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </div>
  );
}
