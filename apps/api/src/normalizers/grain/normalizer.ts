/**
 * Grain transcript normalizer — top-level orchestration.
 *
 * Steps:
 *   1. Validate inputs.
 *   2. Fetch the recording from the Grain API.
 *   3. Map the response to a NormalizedTranscript.
 *   4. Return the result.
 */

import type { NormalizedTranscript, MeetingType } from '@iexcel/shared-types';
import { ApiErrorCode, MeetingType as MeetingTypeEnum } from '@iexcel/shared-types';
import { GrainNormalizerError } from './errors.js';
import { GrainApiClient, type GrainClientConfig } from './grain-client.js';
import { mapGrainRecording } from './mapper.js';

// ---------------------------------------------------------------------------
// Input interface
// ---------------------------------------------------------------------------

export interface NormalizeGrainInput {
  grainRecordingId: string;
  callType: MeetingType;
  clientId: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_CALL_TYPES: ReadonlySet<string> = new Set(
  Object.values(MeetingTypeEnum)
);

function validateInput(input: NormalizeGrainInput): void {
  // FR-10: grainRecordingId validation
  if (!input.grainRecordingId || input.grainRecordingId.trim() === '') {
    throw new GrainNormalizerError(
      ApiErrorCode.ValidationError,
      'grainRecordingId is required',
      400
    );
  }

  if (input.grainRecordingId.length > 500) {
    throw new GrainNormalizerError(
      ApiErrorCode.ValidationError,
      'grainRecordingId is too long',
      400
    );
  }

  if (/\s/.test(input.grainRecordingId)) {
    throw new GrainNormalizerError(
      ApiErrorCode.ValidationError,
      'grainRecordingId must not contain whitespace',
      400
    );
  }

  // FR-11: callType validation
  if (!VALID_CALL_TYPES.has(input.callType)) {
    throw new GrainNormalizerError(
      ApiErrorCode.ValidationError,
      `callType must be one of: ${Array.from(VALID_CALL_TYPES).join(', ')}`,
      400
    );
  }

  // FR-12: clientId validation
  if (!UUID_REGEX.test(input.clientId)) {
    throw new GrainNormalizerError(
      ApiErrorCode.ValidationError,
      'clientId must be a valid UUID',
      400
    );
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Options for the Grain normalizer. The client config is optional —
 * if not provided, the normalizer reads from environment variables.
 */
export interface NormalizeGrainOptions {
  /** Pre-constructed client (for testing). */
  client?: GrainApiClient;
  /** Client config (used if client is not provided). */
  clientConfig?: GrainClientConfig;
}

/**
 * Normalize a Grain recording into a NormalizedTranscript.
 *
 * @throws {GrainNormalizerError} on validation failure, API error, or missing transcript.
 */
export async function normalizeGrainTranscript(
  input: NormalizeGrainInput,
  options?: NormalizeGrainOptions
): Promise<NormalizedTranscript> {
  // 1. Validate
  validateInput(input);

  // 2. Build or use provided client
  const client =
    options?.client ??
    new GrainApiClient(
      options?.clientConfig ?? {
        apiKey: getGrainApiKey(),
        baseUrl:
          process.env['GRAIN_API_BASE_URL'] ?? 'https://api.grain.com/v1',
      }
    );

  // Log fetch attempt (no PII)
  console.info(
    JSON.stringify({
      event: 'grain.fetch_started',
      grainRecordingId: input.grainRecordingId,
      clientId: input.clientId,
    })
  );

  // 3. Fetch recording
  const recording = await client.fetchRecording(input.grainRecordingId);

  // 4. Check transcript availability (FR-44)
  if (
    !recording.transcript ||
    !recording.transcript.segments ||
    recording.transcript.segments.length === 0
  ) {
    throw new GrainNormalizerError(
      ApiErrorCode.GrainTranscriptUnavailable,
      'Grain transcript is not yet available for this recording',
      422
    );
  }

  // 5. Map to NormalizedTranscript
  const normalized = mapGrainRecording({
    recording,
    callType: input.callType,
    clientId: input.clientId,
  });

  // 6. Verify segments non-empty after filtering (FR-57)
  if (normalized.segments.length === 0) {
    throw new GrainNormalizerError(
      ApiErrorCode.GrainTranscriptUnavailable,
      'Grain transcript is not yet available for this recording',
      422
    );
  }

  // Log success (no PII — only counts)
  console.info(
    JSON.stringify({
      event: 'grain.fetch_succeeded',
      grainRecordingId: input.grainRecordingId,
      participantCount: normalized.participants.length,
      segmentCount: normalized.segments.length,
      durationSeconds: normalized.durationSeconds,
    })
  );

  return normalized;
}

/**
 * Retrieve the Grain API key from environment.
 */
function getGrainApiKey(): string {
  const key = process.env['GRAIN_API_KEY'];
  if (!key) {
    throw new GrainNormalizerError(
      ApiErrorCode.GrainApiError,
      'Grain API key is not configured',
      502
    );
  }
  return key;
}
