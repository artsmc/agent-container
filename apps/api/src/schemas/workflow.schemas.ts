import { z } from 'zod';

export const TriggerIntakeSchema = z.object({
  client_id: z.string().uuid(),
  transcript_id: z.string().uuid(),
});

export const TriggerAgendaSchema = z.object({
  client_id: z.string().uuid(),
  cycle_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'cycle_start must be YYYY-MM-DD format').optional(),
  cycle_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'cycle_end must be YYYY-MM-DD format').optional(),
});

export const WorkflowResultSchema = z.object({
  task_short_ids: z.array(z.string()).optional(),
  tasks_attempted: z.number().optional(),
  tasks_created: z.number().optional(),
  tasks_failed: z.number().optional(),
  explanation: z.string().optional(),
  agenda_short_id: z.string().optional(),
});

export const WorkflowErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const UpdateStatusSchema = z.object({
  status: z.enum(['running', 'completed', 'failed']),
  result: WorkflowResultSchema.nullable().optional(),
  error: WorkflowErrorSchema.nullable().optional(),
}).refine(
  (data) => data.status !== 'failed' || data.error !== undefined,
  { message: 'error is required when status is failed', path: ['error'] }
);

export type TriggerIntakeBody = z.infer<typeof TriggerIntakeSchema>;
export type TriggerAgendaBody = z.infer<typeof TriggerAgendaSchema>;
export type UpdateStatusBody = z.infer<typeof UpdateStatusSchema>;
export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;
export type WorkflowError = z.infer<typeof WorkflowErrorSchema>;
