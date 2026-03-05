'use client';

import styles from './AgendaInputs.module.scss';

export interface AgendaInputsProps {
  cycleStart: string;
  cycleEnd: string;
  onCycleStartChange: (date: string) => void;
  onCycleEndChange: (date: string) => void;
  cycleAutoSuggested: boolean;
  errors: Record<string, string>;
}

export default function AgendaInputs({
  cycleStart,
  cycleEnd,
  onCycleStartChange,
  onCycleEndChange,
  cycleAutoSuggested,
  errors,
}: AgendaInputsProps) {
  return (
    <div className={styles.container} data-testid="agenda-inputs">
      <h3 className={styles.sectionTitle}>Cycle Date Range</h3>

      {cycleAutoSuggested && (
        <p className={styles.autoSuggestNote} data-testid="auto-suggest-note">
          Auto-suggested based on last agenda
        </p>
      )}

      <div className={styles.dateRow}>
        <div className={styles.dateField}>
          <label htmlFor="cycle-start-input" className={styles.dateLabel}>
            Cycle Start
          </label>
          <input
            id="cycle-start-input"
            type="date"
            className={`${styles.dateInput} ${
              errors.cycleStart ? styles.dateInputError : ''
            }`}
            value={cycleStart}
            onChange={(e) => onCycleStartChange(e.target.value)}
            aria-describedby={errors.cycleStart ? 'cycle-start-error' : undefined}
            aria-invalid={errors.cycleStart ? true : undefined}
            data-testid="cycle-start-input"
          />
          {errors.cycleStart && (
            <p id="cycle-start-error" className={styles.dateError} role="alert">
              {errors.cycleStart}
            </p>
          )}
        </div>

        <div className={styles.dateField}>
          <label htmlFor="cycle-end-input" className={styles.dateLabel}>
            Cycle End
          </label>
          <input
            id="cycle-end-input"
            type="date"
            className={`${styles.dateInput} ${
              errors.cycleEnd ? styles.dateInputError : ''
            }`}
            value={cycleEnd}
            onChange={(e) => onCycleEndChange(e.target.value)}
            aria-describedby={errors.cycleEnd ? 'cycle-end-error' : undefined}
            aria-invalid={errors.cycleEnd ? true : undefined}
            data-testid="cycle-end-input"
          />
          {errors.cycleEnd && (
            <p id="cycle-end-error" className={styles.dateError} role="alert">
              {errors.cycleEnd}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
