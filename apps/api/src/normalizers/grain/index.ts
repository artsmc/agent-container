/**
 * Grain Transcript Normalizer — Public API
 *
 * Usage (Feature 10 handler call site):
 *
 *   import { normalizeGrainTranscript } from '../../normalizers/grain/index.js';
 *   import type { NormalizeGrainInput } from '../../normalizers/grain/index.js';
 *
 *   const normalized = await normalizeGrainTranscript({
 *     grainRecordingId: body.grain_recording_id,
 *     callType: body.call_type,
 *     clientId: params.clientId,
 *   });
 */

export { normalizeGrainTranscript } from './normalizer.js';
export type { NormalizeGrainInput, NormalizeGrainOptions } from './normalizer.js';
export { GrainNormalizerError } from './errors.js';
export { GrainApiClient } from './grain-client.js';
export type { GrainClientConfig, GrainRecording, GrainRecordingResponse, GrainSegment, GrainTranscript } from './grain-client.js';
