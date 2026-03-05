import { describe, it, expect } from 'vitest';
import {
  TriggerIntakeSchema,
  TriggerAgendaSchema,
  UpdateStatusSchema,
} from '../../schemas/workflow.schemas';

describe('workflow.schemas', () => {
  // -----------------------------------------------------------------------
  // TriggerIntakeSchema
  // -----------------------------------------------------------------------

  describe('TriggerIntakeSchema', () => {
    it('accepts valid intake body', () => {
      const result = TriggerIntakeSchema.safeParse({
        client_id: '00000000-0000-0000-0000-000000000001',
        transcript_id: '00000000-0000-0000-0000-000000000050',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing transcript_id', () => {
      const result = TriggerIntakeSchema.safeParse({
        client_id: '00000000-0000-0000-0000-000000000001',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing client_id', () => {
      const result = TriggerIntakeSchema.safeParse({
        transcript_id: '00000000-0000-0000-0000-000000000050',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID', () => {
      const result = TriggerIntakeSchema.safeParse({
        client_id: 'not-a-uuid',
        transcript_id: '00000000-0000-0000-0000-000000000050',
      });
      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // TriggerAgendaSchema
  // -----------------------------------------------------------------------

  describe('TriggerAgendaSchema', () => {
    it('accepts valid agenda body without optional dates', () => {
      const result = TriggerAgendaSchema.safeParse({
        client_id: '00000000-0000-0000-0000-000000000001',
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid agenda body with cycle dates', () => {
      const result = TriggerAgendaSchema.safeParse({
        client_id: '00000000-0000-0000-0000-000000000001',
        cycle_start: '2026-02-01',
        cycle_end: '2026-02-28',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid date format', () => {
      const result = TriggerAgendaSchema.safeParse({
        client_id: '00000000-0000-0000-0000-000000000001',
        cycle_start: '2026/02/01',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid date format (ISO datetime)', () => {
      const result = TriggerAgendaSchema.safeParse({
        client_id: '00000000-0000-0000-0000-000000000001',
        cycle_start: '2026-02-01T00:00:00Z',
      });
      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // UpdateStatusSchema
  // -----------------------------------------------------------------------

  describe('UpdateStatusSchema', () => {
    it('accepts running status', () => {
      const result = UpdateStatusSchema.safeParse({ status: 'running' });
      expect(result.success).toBe(true);
    });

    it('accepts completed status with result', () => {
      const result = UpdateStatusSchema.safeParse({
        status: 'completed',
        result: { task_short_ids: ['TSK-001'] },
      });
      expect(result.success).toBe(true);
    });

    it('accepts failed status with error', () => {
      const result = UpdateStatusSchema.safeParse({
        status: 'failed',
        error: { code: 'ERR', message: 'Something went wrong' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects failed status without error', () => {
      const result = UpdateStatusSchema.safeParse({
        status: 'failed',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status value', () => {
      const result = UpdateStatusSchema.safeParse({
        status: 'cancelled',
      });
      expect(result.success).toBe(false);
    });

    it('rejects pending status (not a valid callback status)', () => {
      const result = UpdateStatusSchema.safeParse({
        status: 'pending',
      });
      expect(result.success).toBe(false);
    });
  });
});
