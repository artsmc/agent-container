import { z } from 'zod';

export const initDeviceSessionSchema = z.object({
  fingerprint: z.string().min(1, 'fingerprint is required').max(128),
});

export type InitDeviceSessionBody = z.infer<typeof initDeviceSessionSchema>;

export const approveDeviceSessionSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  label: z.string().max(255).optional(),
});

export type ApproveDeviceSessionBody = z.infer<typeof approveDeviceSessionSchema>;
