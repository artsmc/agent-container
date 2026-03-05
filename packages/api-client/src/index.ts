// Core
export { createApiClient, ApiClient } from './core';

// Error class
export { ApiClientError } from './types/errors';

// Type-only exports for consumer configuration
export type { TokenProvider, ApiClientOptions } from './types/client-options';

// Additional types not in shared-types
export type {
  ClientStatusResponse,
  AuditQueryParams,
  AuditEntry,
  AddAsanaWorkspaceRequest,
  ImportStatusResponse,
  TriggerImportRequest,
  RejectTaskRequest,
} from './types/additional';
