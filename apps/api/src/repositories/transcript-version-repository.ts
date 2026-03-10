import { eq, and, sql, max } from 'drizzle-orm';
import { transcripts, transcriptVersions } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import type { TranscriptFormat, EnrichmentStatus, NormalizedTranscript } from '@iexcel/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertTranscriptVersionParams {
  transcriptId: string;
  version: number;
  rawText: string | null;
  format: TranscriptFormat | null;
  normalized: NormalizedTranscript | null;
  enrichmentStatus: EnrichmentStatus;
}

export interface TranscriptVersionRow {
  id: string;
  transcriptId: string;
  version: number;
  rawText: string | null;
  format: string | null;
  normalized: unknown;
  enrichmentStatus: string;
  summary: string | null;
  highlights: unknown;
  actionItems: unknown;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Repository functions
// ---------------------------------------------------------------------------

/**
 * Gets the next version number for a transcript.
 */
export async function getNextVersionNumber(
  db: DbClient,
  transcriptId: string
): Promise<number> {
  const result = await db
    .select({ maxVersion: max(transcriptVersions.version) })
    .from(transcriptVersions)
    .where(eq(transcriptVersions.transcriptId, transcriptId));

  const currentMax = result[0]?.maxVersion;
  return (currentMax ?? 0) + 1;
}

/**
 * Inserts a new transcript version.
 */
export async function insertTranscriptVersion(
  db: DbClient,
  params: InsertTranscriptVersionParams
): Promise<TranscriptVersionRow> {
  const [row] = await db
    .insert(transcriptVersions)
    .values({
      transcriptId: params.transcriptId,
      version: params.version,
      rawText: params.rawText,
      format: params.format,
      normalized: params.normalized,
      enrichmentStatus: params.enrichmentStatus,
    })
    .returning();

  return row as TranscriptVersionRow;
}

/**
 * Updates enrichment results on a transcript version.
 */
export async function updateVersionEnrichment(
  db: DbClient,
  versionId: string,
  params: {
    enrichmentStatus: EnrichmentStatus;
    summary: string | null;
    highlights: string[] | null;
    actionItems: string[] | null;
  }
): Promise<void> {
  await db
    .update(transcriptVersions)
    .set({
      enrichmentStatus: params.enrichmentStatus,
      summary: params.summary,
      highlights: params.highlights,
      actionItems: params.actionItems,
    })
    .where(eq(transcriptVersions.id, versionId));
}

/**
 * Updates the current_version_id on a transcript.
 */
export async function setCurrentVersion(
  db: DbClient,
  transcriptId: string,
  versionId: string
): Promise<void> {
  await db
    .update(transcripts)
    .set({ currentVersionId: versionId })
    .where(eq(transcripts.id, transcriptId));
}

/**
 * Finds an existing transcript by platform recording ID.
 */
export async function findTranscriptByPlatformRecording(
  db: DbClient,
  sourcePlatform: string,
  platformRecordingId: string
): Promise<{ id: string; clientId: string } | null> {
  const rows = await db
    .select({ id: transcripts.id, clientId: transcripts.clientId })
    .from(transcripts)
    .where(
      and(
        eq(transcripts.sourcePlatform, sourcePlatform),
        eq(transcripts.platformRecordingId, platformRecordingId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}
