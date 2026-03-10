import { z } from 'zod';

export const PLATFORM_VALUES = ['fireflies', 'grain'] as const;
export type PlatformValue = (typeof PLATFORM_VALUES)[number];

const PLATFORM_SET: ReadonlySet<string> = new Set(PLATFORM_VALUES);

export function isValidPlatform(value: string): value is PlatformValue {
  return PLATFORM_SET.has(value);
}

export const completeSessionBodySchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  apiKey: z.string().min(1).optional(),
  authorizationCode: z.string().min(1).optional(),
  label: z.string().max(255).optional(),
});

export type CompleteSessionBody = z.infer<typeof completeSessionBodySchema>;

export const connectIntegrationBodySchema = z.object({
  apiKey: z.string().min(1).optional(),
  authorizationCode: z.string().min(1).optional(),
  label: z.string().max(255).optional(),
});

export type ConnectIntegrationBody = z.infer<typeof connectIntegrationBodySchema>;

export const ingestFromTextBodySchema = z.object({
  rawText: z.string().min(50, 'rawText must be at least 50 characters'),
  clientId: z.string().uuid('clientId must be a valid UUID'),
  callType: z.enum(['client_call', 'intake', 'follow_up'], {
    errorMap: () => ({ message: 'callType must be one of: client_call, intake, follow_up' }),
  }),
  callDate: z.string().min(1, 'callDate is required'),
});

export type IngestFromTextBody = z.infer<typeof ingestFromTextBodySchema>;

export const ingestFromUrlBodySchema = z.object({
  integrationId: z.string().uuid('integrationId must be a valid UUID'),
  externalId: z.string().min(1, 'externalId is required'),
  clientId: z.string().uuid('clientId must be a valid UUID').optional(),
});

export type IngestFromUrlBody = z.infer<typeof ingestFromUrlBodySchema>;

// ---------------------------------------------------------------------------
// POST /transcripts/import — Batch import from platform
// ---------------------------------------------------------------------------

export const importFromPlatformBodySchema = z.object({
  platform: z.enum(['fireflies', 'grain'], {
    errorMap: () => ({ message: 'platform must be one of: fireflies, grain' }),
  }),
  recordingIds: z
    .array(z.string().min(1, 'Each recording ID must be non-empty'))
    .min(1, 'At least one recording ID is required')
    .max(20, 'Cannot import more than 20 recordings at once'),
  clientId: z.string().uuid('clientId must be a valid UUID').optional(),
  meetingType: z.enum(['client_call', 'intake', 'follow_up']).optional(),
});

export type ImportFromPlatformBody = z.infer<typeof importFromPlatformBodySchema>;

// ---------------------------------------------------------------------------
// POST /transcripts/from-url — Auto-detect platform from URL, fetch, ingest
// ---------------------------------------------------------------------------

export const importFromUrlBodySchema = z.object({
  url: z.string().url('url must be a valid URL'),
  clientId: z.string().uuid('clientId must be a valid UUID').optional(),
  meetingType: z.enum(['client_call', 'intake', 'follow_up']).optional(),
});

export type ImportFromUrlBody = z.infer<typeof importFromUrlBodySchema>;
