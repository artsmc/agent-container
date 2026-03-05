import { validateForm } from './validate';
import { createInitialFormState, formatDateISO } from './types';
import type { FormState } from './types';

/**
 * Creates a form state with all fields set for a valid intake submission.
 */
function validIntakeState(): FormState {
  return {
    ...createInitialFormState(),
    workflowType: 'intake',
    clientId: 'client-001',
    clientName: 'Test Client',
    transcriptSource: 'paste',
    transcriptText: 'This is a valid transcript.',
    callDate: formatDateISO(new Date()),
  };
}

/**
 * Creates a form state with all fields set for a valid agenda submission.
 */
function validAgendaState(): FormState {
  return {
    ...createInitialFormState(),
    workflowType: 'agenda',
    clientId: 'client-001',
    clientName: 'Test Client',
    cycleStart: '2026-03-01',
    cycleEnd: '2026-03-31',
  };
}

describe('validateForm', () => {
  describe('workflow type validation', () => {
    it('returns error when workflow type is not selected', () => {
      const state = createInitialFormState();
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      expect(result.errors.workflowType).toBe('Please select a workflow type');
    });
  });

  describe('client validation', () => {
    it('returns error when client is not selected', () => {
      const state: FormState = {
        ...createInitialFormState(),
        workflowType: 'intake',
      };
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      expect(result.errors.clientId).toBe('Please select a client');
    });
  });

  describe('intake workflow validation', () => {
    it('returns error when transcript is empty (paste mode)', () => {
      const state: FormState = {
        ...validIntakeState(),
        transcriptSource: 'paste',
        transcriptText: '',
      };
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      expect(result.errors.transcript).toBe('Please paste the transcript text');
    });

    it('returns error when transcript is whitespace only (paste mode)', () => {
      const state: FormState = {
        ...validIntakeState(),
        transcriptSource: 'paste',
        transcriptText: '   \n  ',
      };
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      expect(result.errors.transcript).toBe('Please paste the transcript text');
    });

    it('returns upload-specific error when transcript is empty (upload mode)', () => {
      const state: FormState = {
        ...validIntakeState(),
        transcriptSource: 'upload',
        transcriptText: '',
      };
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      expect(result.errors.transcript).toBe('Please upload a transcript file');
    });

    it('returns error when call date is missing', () => {
      const state: FormState = {
        ...validIntakeState(),
        callDate: '',
      };
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      expect(result.errors.callDate).toBe('Call date is required');
    });

    it('returns error when call date is in the future', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const state: FormState = {
        ...validIntakeState(),
        callDate: formatDateISO(tomorrow),
      };
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      expect(result.errors.callDate).toBe('Call date cannot be in the future');
    });

    it('accepts today as a valid call date', () => {
      const state = validIntakeState();
      const result = validateForm(state);
      expect(result.valid).toBe(true);
      expect(result.errors.callDate).toBeUndefined();
    });

    it('returns valid for fully valid intake form', () => {
      const state = validIntakeState();
      const result = validateForm(state);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });
  });

  describe('agenda workflow validation', () => {
    it('returns error when cycle start date is missing', () => {
      const state: FormState = {
        ...validAgendaState(),
        cycleStart: '',
      };
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      expect(result.errors.cycleStart).toBe('Cycle start date is required');
    });

    it('returns error when cycle end date is missing', () => {
      const state: FormState = {
        ...validAgendaState(),
        cycleEnd: '',
      };
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      expect(result.errors.cycleEnd).toBe('Cycle end date is required');
    });

    it('returns error when end date equals start date', () => {
      const state: FormState = {
        ...validAgendaState(),
        cycleStart: '2026-03-01',
        cycleEnd: '2026-03-01',
      };
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      expect(result.errors.cycleEnd).toBe('End date must be after start date');
    });

    it('returns error when end date is before start date', () => {
      const state: FormState = {
        ...validAgendaState(),
        cycleStart: '2026-03-15',
        cycleEnd: '2026-03-01',
      };
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      expect(result.errors.cycleEnd).toBe('End date must be after start date');
    });

    it('returns valid for fully valid agenda form', () => {
      const state = validAgendaState();
      const result = validateForm(state);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });
  });

  describe('combined validation', () => {
    it('returns multiple errors when multiple fields are invalid', () => {
      const state = createInitialFormState();
      const result = validateForm(state);
      expect(result.valid).toBe(false);
      // Should have at least workflowType and clientId errors
      expect(result.errors.workflowType).toBeDefined();
      expect(result.errors.clientId).toBeDefined();
    });
  });
});
