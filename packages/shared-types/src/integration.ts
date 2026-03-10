/**
 * Integration and Transcript Pipeline Types
 *
 * Types for the transcript ingestion pipeline, platform integrations,
 * credential management, and LLM enrichment.
 */

// ---------------------------------------------------------------------------
// Platform & Integration
// ---------------------------------------------------------------------------

/**
 * Supported transcript ingestion platforms.
 * New platforms are added here as union members.
 */
export type IntegrationPlatform = 'fireflies' | 'grain';

/**
 * Lifecycle status of a platform integration connection.
 */
export type IntegrationStatus = 'connected' | 'expired' | 'disconnected';

/**
 * Summary of a user's platform integration, returned by API list endpoints.
 * Credentials are never exposed — only connection metadata.
 */
export interface Integration {
  id: string;
  userId: string;
  platform: IntegrationPlatform;
  status: IntegrationStatus;
  /** Display label set by the user (e.g., "My Fireflies Account"). */
  label: string | null;
  /** Platform-generated webhook URL for auto-ingest. */
  webhookUrl: string | null;
  /** ISO 8601 datetime of last successful sync/ingest. */
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Transcript Format Detection
// ---------------------------------------------------------------------------

/**
 * Detected format of raw transcript text.
 * Used by the format detector to route to the correct parser.
 */
export type TranscriptFormat = 'srt' | 'turnbased' | 'raw';

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

/**
 * Status of LLM enrichment processing for a transcript.
 */
export type EnrichmentStatus = 'pending' | 'complete' | 'failed';

// ---------------------------------------------------------------------------
// Client Matching
// ---------------------------------------------------------------------------

/**
 * Whether an auto-ingested transcript was matched to a client.
 */
export type ClientMatchStatus = 'matched' | 'unmatched';

// ---------------------------------------------------------------------------
// Transcript Versioning
// ---------------------------------------------------------------------------

/**
 * A versioned snapshot of a transcript's processed state.
 */
export interface TranscriptVersion {
  id: string;
  transcriptId: string;
  version: number;
  /** The enrichment status at this version. */
  enrichmentStatus: EnrichmentStatus;
  /** Agent-generated summary. Null if enrichment incomplete. */
  summary: string | null;
  /** Key highlights extracted by LLM. Null if enrichment incomplete. */
  highlights: string[] | null;
  /** Action items extracted by LLM. Null if enrichment incomplete. */
  actionItems: string[] | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API Request / Response Contracts — Integrations
// ---------------------------------------------------------------------------

/**
 * Request body to connect a new platform integration.
 * For Fireflies: provide apiKey.
 * For Grain: provide OAuth2 authorization code.
 */
export interface ConnectIntegrationRequest {
  platform: IntegrationPlatform;
  /** User-friendly label for this connection. */
  label?: string;
  /** Fireflies API key. Required when platform is 'fireflies'. */
  apiKey?: string;
  /** Grain OAuth2 authorization code. Required when platform is 'grain'. */
  authorizationCode?: string;
}

/**
 * Response after connecting a new integration.
 */
export interface ConnectIntegrationResponse {
  integration: Integration;
}

/**
 * Request body to update an existing integration.
 */
export interface UpdateIntegrationRequest {
  label?: string;
  /** New API key (Fireflies only). */
  apiKey?: string;
}

/**
 * Response for listing integrations.
 */
export interface ListIntegrationsResponse {
  integrations: Integration[];
}

/**
 * Response for a single integration.
 */
export interface GetIntegrationResponse {
  integration: Integration;
}

/**
 * Response after disconnecting an integration.
 */
export interface DisconnectIntegrationResponse {
  success: boolean;
}

// ---------------------------------------------------------------------------
// API Request / Response Contracts — Transcript Ingest
// ---------------------------------------------------------------------------

/**
 * Request body to ingest a transcript from a URL (platform fetch).
 */
export interface IngestTranscriptFromUrlRequest {
  /** Platform integration ID to use for fetching. */
  integrationId: string;
  /** Platform-specific recording/transcript ID. */
  externalId: string;
  /** Optional client ID to match. If omitted, auto-matching is attempted. */
  clientId?: string;
}

/**
 * Request body to ingest a transcript from raw text.
 */
export interface IngestTranscriptFromTextRequest {
  /** Raw transcript text content. */
  rawText: string;
  /** Client ID to associate with. */
  clientId: string;
  /** Call type for the transcript. */
  callType: 'client_call' | 'intake' | 'follow_up';
  /** ISO 8601 datetime of the call. */
  callDate: string;
}

/**
 * Response after ingesting a transcript.
 */
export interface IngestTranscriptResponse {
  id: string;
  clientId: string | null;
  matchStatus: ClientMatchStatus;
  format: TranscriptFormat;
  enrichmentStatus: EnrichmentStatus;
  /** Version number (starts at 1, incremented on re-ingest). */
  version: number;
  createdAt: string;
}

/**
 * Webhook payload received from platforms for auto-ingest.
 */
export interface WebhookIngestPayload {
  /** Platform that sent the webhook. */
  platform: IntegrationPlatform;
  /** Platform-specific event type. */
  eventType: string;
  /** Platform-specific recording/meeting ID. */
  externalId: string;
  /** Raw payload from the platform (varies by platform). */
  rawPayload: Record<string, unknown>;
}
