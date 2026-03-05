/**
 * Text Transcript Normalizer — Public API
 *
 * Usage (feature 10 handler call site):
 *
 *   import { normalizeTextTranscript } from '../normalizers/text';
 *   import type { NormalizeTextInput } from '../normalizers/text';
 *
 *   // Inside POST /clients/:clientId/transcripts handler:
 *   const rawText = body.rawTranscript ?? (await readUploadedFile(request));
 *   const normalized = normalizeTextTranscript({
 *     rawText,
 *     callType: body.callType,
 *     callDate: body.callDate,
 *     clientId: params.clientId,
 *   });
 *   // Pass `normalized` to the persistence layer (feature 10)
 *
 * NOTE: File upload handling (MIME validation, 5 MB limit, UTF-8 decoding)
 * is the responsibility of the API route handler, not this module.
 * See feature 10 for the full handler implementation.
 */

export { normalizeTextTranscript } from './normalizer.js';
export type { NormalizeTextInput } from './normalizer.js';
export { NormalizerError } from './errors.js';
