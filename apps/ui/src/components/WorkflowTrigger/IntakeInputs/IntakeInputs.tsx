'use client';

import { TranscriptSourceSelector } from '../TranscriptSourceSelector';
import type { TranscriptSource } from '@/lib/workflow/types';
import { formatDateISO } from '@/lib/workflow/types';
import styles from './IntakeInputs.module.scss';

export interface IntakeInputsProps {
  transcriptSource: TranscriptSource;
  onSourceChange: (source: TranscriptSource) => void;
  transcriptText: string;
  onTextChange: (text: string) => void;
  fileName: string | null;
  onFileChange: (fileName: string, text: string) => void;
  onFileClear: () => void;
  callDate: string;
  onCallDateChange: (date: string) => void;
  errors: Record<string, string>;
}

export default function IntakeInputs({
  transcriptSource,
  onSourceChange,
  transcriptText,
  onTextChange,
  fileName,
  onFileChange,
  onFileClear,
  callDate,
  onCallDateChange,
  errors,
}: IntakeInputsProps) {
  const todayISO = formatDateISO(new Date());

  return (
    <div className={styles.container} data-testid="intake-inputs">
      <h3 className={styles.sectionTitle}>Transcript</h3>
      <TranscriptSourceSelector
        source={transcriptSource}
        onSourceChange={onSourceChange}
        transcriptText={transcriptText}
        onTextChange={onTextChange}
        fileName={fileName}
        onFileChange={onFileChange}
        onFileClear={onFileClear}
        error={errors.transcript}
      />

      <div className={styles.dateField}>
        <label htmlFor="call-date-input" className={styles.dateLabel}>
          Call Date
        </label>
        <input
          id="call-date-input"
          type="date"
          className={`${styles.dateInput} ${
            errors.callDate ? styles.dateInputError : ''
          }`}
          value={callDate}
          max={todayISO}
          onChange={(e) => onCallDateChange(e.target.value)}
          aria-describedby={errors.callDate ? 'call-date-error' : undefined}
          aria-invalid={errors.callDate ? true : undefined}
          data-testid="call-date-input"
        />
        {errors.callDate && (
          <p id="call-date-error" className={styles.dateError} role="alert">
            {errors.callDate}
          </p>
        )}
      </div>
    </div>
  );
}
