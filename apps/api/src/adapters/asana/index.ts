/**
 * Asana Output Adapter — Public API
 *
 * Exports only the public surface:
 * - AsanaOutputAdapter: implements OutputNormalizerService for Asana push
 * - AdapterError: typed error class with ApiErrorCode codes
 *
 * Internal sub-modules (description-formatter, workspace-router, etc.)
 * are NOT exported. Consumers should only interact with the adapter class.
 */

export { AsanaOutputAdapter } from './adapter';
export { AdapterError } from './errors';
