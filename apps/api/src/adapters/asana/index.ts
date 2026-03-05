/**
 * Asana Output Adapter — Public API
 *
 * Exports the public surface:
 * - AsanaOutputAdapter: implements OutputNormalizerService for Asana push
 * - AdapterError: typed error class with ApiErrorCode codes
 * - reconcileTasksForClient: status reconciliation (Feature 13)
 * - ReconciliationError: typed error for reconciliation failures
 * - ReconciledTask, AsanaTaskStatus, AsanaCustomField: reconciliation types
 *
 * Internal sub-modules (description-formatter, workspace-router, etc.)
 * are NOT exported. Consumers should only interact with the adapter class
 * and the reconciliation function.
 */

export { AsanaOutputAdapter } from './adapter';
export { AdapterError } from './errors';

// Feature 13: Status Reconciliation
export { reconcileTasksForClient } from './reconcile';
export type { ReconciledTask, AsanaTaskStatus, AsanaCustomField } from './reconcile';
export { ReconciliationError } from './reconciliation-error';
export type { ReconciliationErrorCode } from './reconciliation-error';
