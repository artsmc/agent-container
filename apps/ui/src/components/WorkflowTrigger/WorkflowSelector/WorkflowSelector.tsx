'use client';

import type { WorkflowType } from '@/lib/workflow/types';
import styles from './WorkflowSelector.module.scss';

interface WorkflowOption {
  value: WorkflowType;
  label: string;
  description: string;
}

const WORKFLOW_OPTIONS: WorkflowOption[] = [
  {
    value: 'intake',
    label: 'Intake \u2192 Tasks',
    description: 'Submit a transcript from an intake call to generate draft tasks',
  },
  {
    value: 'agenda',
    label: 'Completed Tasks \u2192 Agenda',
    description: 'Pull completed tasks for a cycle period to generate Running Notes',
  },
];

export interface WorkflowSelectorProps {
  selected: WorkflowType | null;
  onChange: (type: WorkflowType) => void;
  error?: string;
}

export default function WorkflowSelector({
  selected,
  onChange,
  error,
}: WorkflowSelectorProps) {
  return (
    <fieldset
      className={styles.fieldset}
      aria-describedby={error ? 'workflow-selector-error' : undefined}
    >
      <legend className={styles.legend}>Select Workflow Type</legend>
      <div className={styles.selectorContainer} role="radiogroup">
        {WORKFLOW_OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`${styles.option} ${isSelected ? styles.selected : ''}`}
              onClick={() => onChange(option.value)}
              data-testid={`workflow-option-${option.value}`}
            >
              <span className={styles.optionLabel}>{option.label}</span>
              <span className={styles.optionDescription}>{option.description}</span>
            </button>
          );
        })}
      </div>
      {error && (
        <p id="workflow-selector-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
