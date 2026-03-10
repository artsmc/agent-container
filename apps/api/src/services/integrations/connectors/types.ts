/**
 * Platform Connector Interface
 *
 * All platform connectors implement this interface to provide
 * a uniform API for fetching transcripts and managing webhooks.
 */

export interface PlatformMeta {
  /** Title or name of the meeting/recording. */
  title: string | null;
  /** ISO 8601 datetime of the meeting. */
  meetingDate: string | null;
  /** Participant names. */
  participants: string[];
  /** Duration in seconds. */
  durationSeconds: number | null;
}

export interface FetchTranscriptResult {
  /** Raw transcript text content. */
  rawText: string;
  /** Platform-specific metadata about the recording. */
  platformMeta: PlatformMeta;
}

/**
 * A recording available on a connected platform.
 * Returned by listRecordings() for UI display / selection.
 */
export interface PlatformRecording {
  /** Platform-specific recording ID. */
  id: string;
  /** Recording / meeting title. */
  title: string;
  /** ISO 8601 datetime of the recording. */
  date: string;
  /** Duration of the recording in seconds. */
  durationSeconds: number;
  /** Participant names. */
  participants: string[];
}

export interface PlatformConnector {
  /**
   * Lists available recordings from the platform.
   *
   * @param credentials - Decrypted credential data (shape varies by platform).
   * @returns Array of recordings with metadata.
   */
  listRecordings(
    credentials: Record<string, unknown>
  ): Promise<PlatformRecording[]>;

  /**
   * Fetches a transcript from the platform.
   *
   * @param credentials - Decrypted credential data (shape varies by platform).
   * @param recordingId - Platform-specific recording/meeting ID.
   */
  fetchTranscript(
    credentials: Record<string, unknown>,
    recordingId: string
  ): Promise<FetchTranscriptResult>;

  /**
   * Registers a webhook with the platform for auto-ingest.
   *
   * @param credentials - Decrypted credential data.
   * @param webhookUrl - The URL to receive webhook events.
   * @returns The webhook ID assigned by the platform.
   */
  registerWebhook?(
    credentials: Record<string, unknown>,
    webhookUrl: string
  ): Promise<string>;
}
