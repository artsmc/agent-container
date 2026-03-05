/**
 * Form validation for the Workflow Trigger feature.
 *
 * Pure function with no side effects -- returns validation result
 * with error messages keyed by field name.
 */

import type { FormState } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validates the workflow trigger form state.
 * All rules run synchronously before any API call is made.
 */
export function validateForm(state: FormState): ValidationResult {
  const errors: Record<string, string> = {};

  if (!state.workflowType) {
    errors.workflowType = 'Please select a workflow type';
  }

  if (!state.clientId) {
    errors.clientId = 'Please select a client';
  }

  if (state.workflowType === 'intake') {
    if (!state.transcriptText || state.transcriptText.trim() === '') {
      errors.transcript =
        state.transcriptSource === 'paste'
          ? 'Please paste the transcript text'
          : 'Please upload a transcript file';
    }

    if (!state.callDate) {
      errors.callDate = 'Call date is required';
    } else {
      const callDate = new Date(state.callDate + 'T23:59:59');
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (callDate > today) {
        errors.callDate = 'Call date cannot be in the future';
      }
    }
  }

  if (state.workflowType === 'agenda') {
    if (!state.cycleStart) {
      errors.cycleStart = 'Cycle start date is required';
    }

    if (!state.cycleEnd) {
      errors.cycleEnd = 'Cycle end date is required';
    }

    if (state.cycleStart && state.cycleEnd && state.cycleEnd <= state.cycleStart) {
      errors.cycleEnd = 'End date must be after start date';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
