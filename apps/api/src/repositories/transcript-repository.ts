import { eq, sql, and, count } from 'drizzle-orm';
import { transcripts } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import type { NormalizedTranscript } from '@iexcel/shared-types';
import type { CallTypeValue } from '../validators/transcript-validators';
import type {
  TranscriptRecord,
  TranscriptSummary,
  ListTranscriptsResult,
  InsertTranscriptParams,
  ListTranscriptsParams,
} from '../services/transcript-types';

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

interface TranscriptRowFull {
  id: string;
  clientId: string;
  grainCallId: string | null;
  callType: string;
  callDate: Date;
  rawTranscript: string | null;
  normalizedSegments: unknown;
  processedAt: Date | null;
  createdAt: Date;
}

interface TranscriptRowSummary {
  id: string;
  clientId: string;
  grainCallId: string | null;
  callType: string;
  callDate: Date;
  processedAt: Date | null;
  createdAt: Date;
}

function mapFullRow(row: TranscriptRowFull): TranscriptRecord {
  return {
    id: row.id,
    client_id: row.clientId,
    grain_call_id: row.grainCallId ?? null,
    call_type: row.callType as CallTypeValue,
    call_date: row.callDate.toISOString(),
    raw_transcript: row.rawTranscript ?? '',
    normalized_segments: row.normalizedSegments as NormalizedTranscript,
    processed_at: row.processedAt ? row.processedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  };
}

function mapSummaryRow(row: TranscriptRowSummary): TranscriptSummary {
  return {
    id: row.id,
    client_id: row.clientId,
    grain_call_id: row.grainCallId ?? null,
    call_type: row.callType as CallTypeValue,
    call_date: row.callDate.toISOString(),
    processed_at: row.processedAt ? row.processedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Repository functions
// ---------------------------------------------------------------------------

/**
 * Inserts a new transcript row and returns the full record.
 */
export async function insertTranscript(
  db: DbClient,
  params: InsertTranscriptParams
): Promise<TranscriptRecord> {
  const inserted = await db
    .insert(transcripts)
    .values({
      clientId: params.clientId,
      grainCallId: params.grainCallId ?? null,
      callType: params.callType,
      callDate: new Date(params.callDate),
      rawTranscript: params.rawTranscript,
      normalizedSegments: params.normalizedSegments,
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new Error('Failed to insert transcript');
  }

  return mapFullRow(row as TranscriptRowFull);
}

/**
 * Returns a paginated list of transcript summaries for a client.
 * Supports optional call_type and date range filters.
 * Executes data and count queries concurrently.
 */
export async function listTranscripts(
  db: DbClient,
  params: ListTranscriptsParams
): Promise<ListTranscriptsResult> {
  const { clientId, callType, fromDate, toDate, page, perPage } = params;
  const offset = (page - 1) * perPage;

  // Build WHERE conditions
  const conditions = [eq(transcripts.clientId, clientId)];

  if (callType) {
    conditions.push(eq(transcripts.callType, callType));
  }

  if (fromDate) {
    conditions.push(
      sql`${transcripts.callDate} >= ${fromDate}::date`
    );
  }

  if (toDate) {
    // Add 1 day to include transcripts on the to_date itself
    conditions.push(
      sql`${transcripts.callDate} < (${toDate}::date + INTERVAL '1 day')`
    );
  }

  const whereClause = and(...conditions);

  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: transcripts.id,
        clientId: transcripts.clientId,
        grainCallId: transcripts.grainCallId,
        callType: transcripts.callType,
        callDate: transcripts.callDate,
        processedAt: transcripts.processedAt,
        createdAt: transcripts.createdAt,
      })
      .from(transcripts)
      .where(whereClause)
      .orderBy(sql`${transcripts.callDate} DESC`)
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: count() })
      .from(transcripts)
      .where(whereClause),
  ]);

  return {
    rows: rows.map(mapSummaryRow),
    total: totalResult[0]?.count ?? 0,
  };
}

/**
 * Returns a single transcript by ID, including all fields.
 * Returns null if not found.
 */
export async function getTranscriptById(
  db: DbClient,
  transcriptId: string
): Promise<TranscriptRecord | null> {
  const rows = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.id, transcriptId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return mapFullRow(row as TranscriptRowFull);
}
