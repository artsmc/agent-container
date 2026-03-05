/**
 * Google Docs Adapter — Public API
 *
 * Exports the public surface:
 * - exportToGoogleDoc: function-based adapter for direct invocation
 * - GoogleDocsAdapter: class implementing GoogleDocsAdapterService (Feature 14)
 * - GoogleDocsAdapterError: typed error class
 * - Type exports for consumers
 */

export { exportToGoogleDoc, GoogleDocsAdapter } from './adapter';
export type {
  AgendaExportInput,
  ClientDocConfig,
  GoogleDocExportResult,
  GoogleServiceAccountCredentials,
} from './adapter';
export {
  GoogleDocsAdapterError,
  type GoogleDocsErrorCode,
} from './google-docs-error';
