import { NotImplementedError } from '../errors/api-errors';
import type {
  NormalizedTaskPayload,
  WorkspaceConfig,
  ExternalRefResponse,
} from './task-types';

// ---------------------------------------------------------------------------
// Output Normalizer Service Interface (Feature 12)
// ---------------------------------------------------------------------------

/**
 * Internal service interface for pushing tasks to external PM systems.
 *
 * Feature 12 will replace the stub implementation with a real one
 * that calls the Asana API (or other PM tools).
 *
 * This interface is the contract between Feature 11 (task endpoints)
 * and Feature 12 (output normalizer / Asana integration).
 */
export interface OutputNormalizerService {
  pushTask(params: {
    task: NormalizedTaskPayload;
    workspace: WorkspaceConfig;
  }): Promise<ExternalRefResponse>;
}

// ---------------------------------------------------------------------------
// Stub implementation — throws NotImplementedError
// ---------------------------------------------------------------------------

/**
 * Stub implementation of the OutputNormalizerService.
 * Throws NotImplementedError for all operations.
 *
 * This stub will be replaced by the real implementation when Feature 12
 * is built. Tests can provide a mock implementation via the constructor
 * or by replacing this instance.
 */
export class OutputNormalizerStub implements OutputNormalizerService {
  async pushTask(_params: {
    task: NormalizedTaskPayload;
    workspace: WorkspaceConfig;
  }): Promise<ExternalRefResponse> {
    throw new NotImplementedError(
      'OutputNormalizerService.pushTask is not yet implemented. ' +
      'Feature 12 (Asana integration) must provide the real implementation.'
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton instance — replaceable for testing
// ---------------------------------------------------------------------------

let _normalizer: OutputNormalizerService = new OutputNormalizerStub();

/**
 * Returns the current OutputNormalizerService instance.
 */
export function getOutputNormalizer(): OutputNormalizerService {
  return _normalizer;
}

/**
 * Replaces the OutputNormalizerService instance.
 * Used by Feature 12 to install the real implementation,
 * or by tests to inject a mock.
 */
export function setOutputNormalizer(normalizer: OutputNormalizerService): void {
  _normalizer = normalizer;
}
