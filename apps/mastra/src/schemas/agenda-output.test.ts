/**
 * Unit tests for the Agenda Agent LLM output schema.
 *
 * @see Feature 20 — Task 20-14
 */
import { describe, it, expect } from 'vitest';
import { agendaOutputSchema } from './agenda-output';

describe('agendaOutputSchema', () => {
  it('accepts a valid content response', () => {
    const input = {
      content: 'A'.repeat(150),
    };
    const result = agendaOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts NO_COMPLETED_TASKS error response', () => {
    const input = {
      error: 'NO_COMPLETED_TASKS' as const,
      message: 'No completed tasks found.',
    };
    const result = agendaOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects content shorter than 100 characters', () => {
    const input = {
      content: 'Too short',
    };
    const result = agendaOutputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects empty content string', () => {
    const input = {
      content: '',
    };
    const result = agendaOutputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    const input = {};
    const result = agendaOutputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid error code', () => {
    const input = {
      error: 'INVALID_CODE',
      message: 'Something went wrong.',
    };
    const result = agendaOutputSchema.safeParse(input);
    // This should fail because 'INVALID_CODE' is not 'NO_COMPLETED_TASKS'
    // and there's no 'content' field either
    expect(result.success).toBe(false);
  });

  it('rejects content as number', () => {
    const input = {
      content: 12345,
    };
    const result = agendaOutputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
