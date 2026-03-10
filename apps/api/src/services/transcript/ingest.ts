import type { DbClient } from '../../db/client';
import type {
  NormalizedTranscript,
  MeetingType,
  TranscriptFormat,
  EnrichmentStatus,
  ClientMatchStatus,
} from '@iexcel/shared-types';
import { detectFormat, parseTranscript } from './index';
import {
  enrichTranscript,
  type LlmClient,
  type EnrichmentResult,
} from './enrichment';
import { insertTranscript } from '../../repositories/transcript-repository';
import {
  getNextVersionNumber,
  insertTranscriptVersion,
  updateVersionEnrichment,
  setCurrentVersion,
  findTranscriptByPlatformRecording,
} from '../../repositories/transcript-version-repository';
import type { CallTypeValue } from '../../validators/transcript-validators';
import { eq } from 'drizzle-orm';
import { transcripts as transcriptsTable } from '@iexcel/database/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngestFromTextParams {
  rawText: string;
  clientId: string;
  callType: MeetingType;
  callDate: string;
}

export interface IngestFromPlatformParams {
  rawText: string;
  clientId: string | null;
  callType: MeetingType;
  callDate: string;
  sourcePlatform: string;
  platformRecordingId: string;
}

export interface IngestResult {
  transcriptId: string;
  versionId: string;
  version: number;
  format: TranscriptFormat;
  matchStatus: ClientMatchStatus;
  enrichmentStatus: EnrichmentStatus;
}

// ---------------------------------------------------------------------------
// Core ingest pipeline
// ---------------------------------------------------------------------------

/**
 * Ingests a transcript from raw text (direct user submission).
 *
 * Pipeline:
 * 1. Detect format
 * 2. Parse into NormalizedTranscript
 * 3. Insert transcript row
 * 4. Create version 1
 * 5. Trigger async enrichment (fire-and-forget)
 * 6. Return result
 */
export async function ingestFromText(
  db: DbClient,
  params: IngestFromTextParams,
  llmClient?: LlmClient | null
): Promise<IngestResult> {
  const { rawText, clientId, callType, callDate } = params;

  // 1. Detect format
  const format = detectFormat(rawText);

  // 2. Parse
  const normalized = parseTranscript({
    rawText,
    format,
    callType,
    callDate,
    clientId,
  });

  // 3. Insert transcript
  const transcript = await insertTranscript(db, {
    clientId,
    callType: callType as CallTypeValue,
    callDate,
    rawTranscript: rawText,
    normalizedSegments: normalized,
  });

  // 4. Create version 1
  const version = await insertTranscriptVersion(db, {
    transcriptId: transcript.id,
    version: 1,
    rawText,
    format,
    normalized,
    enrichmentStatus: 'pending',
  });

  // 5. Set current version
  await setCurrentVersion(db, transcript.id, version.id);

  // 6. Fire-and-forget enrichment
  if (llmClient) {
    runEnrichmentAsync(db, version.id, normalized, llmClient);
  }

  return {
    transcriptId: transcript.id,
    versionId: version.id,
    version: 1,
    format,
    matchStatus: 'matched',
    enrichmentStatus: 'pending',
  };
}

/**
 * Ingests a transcript from a platform (Fireflies/Grain webhook or fetch).
 *
 * Handles versioning: if the same platform_recording_id already exists,
 * creates a new version instead of a new transcript.
 */
export async function ingestFromPlatform(
  db: DbClient,
  params: IngestFromPlatformParams,
  llmClient?: LlmClient | null
): Promise<IngestResult> {
  const {
    rawText,
    clientId,
    callType,
    callDate,
    sourcePlatform,
    platformRecordingId,
  } = params;

  // 1. Detect format and parse
  const format = detectFormat(rawText);
  const normalized = parseTranscript({
    rawText,
    format,
    callType,
    callDate,
    clientId: clientId ?? '',
  });
  // Note: empty string clientId above is only for normalizer output (sourceId).
  // The actual DB insert uses the nullable clientId directly.

  // 2. Check for existing transcript (duplicate = version)
  const existing = await findTranscriptByPlatformRecording(
    db,
    sourcePlatform,
    platformRecordingId
  );

  const matchStatus: ClientMatchStatus = clientId ? 'matched' : 'unmatched';

  if (existing) {
    // Version the existing transcript
    const versionNumber = await getNextVersionNumber(db, existing.id);

    const version = await insertTranscriptVersion(db, {
      transcriptId: existing.id,
      version: versionNumber,
      rawText,
      format,
      normalized,
      enrichmentStatus: 'pending',
    });

    await setCurrentVersion(db, existing.id, version.id);

    if (llmClient) {
      runEnrichmentAsync(db, version.id, normalized, llmClient);
    }

    return {
      transcriptId: existing.id,
      versionId: version.id,
      version: versionNumber,
      format,
      matchStatus,
      enrichmentStatus: 'pending',
    };
  }

  // 3. New transcript
  const transcript = await insertTranscript(db, {
    clientId,
    callType: callType as CallTypeValue,
    callDate,
    rawTranscript: rawText,
    normalizedSegments: normalized,
  });

  // Update platform-specific columns
  await db
    .update(transcriptsTable)
    .set({
      sourcePlatform,
      platformRecordingId,
      clientMatchStatus: matchStatus,
    })
    .where(eq(transcriptsTable.id, transcript.id));

  // 4. Create version 1
  const version = await insertTranscriptVersion(db, {
    transcriptId: transcript.id,
    version: 1,
    rawText,
    format,
    normalized,
    enrichmentStatus: 'pending',
  });

  await setCurrentVersion(db, transcript.id, version.id);

  if (llmClient) {
    runEnrichmentAsync(db, version.id, normalized, llmClient);
  }

  return {
    transcriptId: transcript.id,
    versionId: version.id,
    version: 1,
    format,
    matchStatus,
    enrichmentStatus: 'pending',
  };
}

// ---------------------------------------------------------------------------
// Async enrichment (fire-and-forget)
// ---------------------------------------------------------------------------

function runEnrichmentAsync(
  db: DbClient,
  versionId: string,
  normalized: NormalizedTranscript,
  llmClient: LlmClient
): void {
  enrichTranscript(normalized.segments, llmClient)
    .then(async (result: EnrichmentResult) => {
      await updateVersionEnrichment(db, versionId, {
        enrichmentStatus: result.status,
        summary: result.summary,
        highlights: result.highlights,
        actionItems: result.actionItems,
      });
    })
    .catch(async () => {
      // Mark as failed on unexpected errors
      await updateVersionEnrichment(db, versionId, {
        enrichmentStatus: 'failed',
        summary: null,
        highlights: null,
        actionItems: null,
      }).catch(() => {
        // Swallow nested errors — enrichment failure is non-critical
      });
    });
}
