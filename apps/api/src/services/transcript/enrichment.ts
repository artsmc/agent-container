import type { TranscriptSegment, NormalizedTranscript } from '@iexcel/shared-types';
import type { EnrichmentStatus } from '@iexcel/shared-types';
import {
  chunkSegments,
  mergeEnrichedChunks,
  type TranscriptChunk,
  type EnrichedChunkResult,
  type MergedEnrichment,
} from './chunker';

// ---------------------------------------------------------------------------
// LLM client abstraction
// ---------------------------------------------------------------------------

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmClient {
  chat(messages: LlmChatMessage[]): Promise<string>;
}

/**
 * Creates an LLM client using the OpenAI-compatible chat completions API.
 */
export function createLlmClient(options: {
  apiKey: string;
  model: string;
  baseUrl?: string;
}): LlmClient {
  const { apiKey, model, baseUrl } = options;
  const url = `${baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`;

  return {
    async chat(messages: LlmChatMessage[]): Promise<string> {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`LLM API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      return data.choices[0]?.message?.content ?? '';
    },
  };
}

// ---------------------------------------------------------------------------
// Enrichment result
// ---------------------------------------------------------------------------

export interface EnrichmentResult {
  status: EnrichmentStatus;
  summary: string | null;
  highlights: string[] | null;
  actionItems: string[] | null;
  /** Updated segments with normalized speaker names (if applicable). */
  segments: TranscriptSegment[];
}

// ---------------------------------------------------------------------------
// Enrichment service
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a meeting transcript analyzer. Given a section of a meeting transcript, produce a JSON response with exactly these fields:
- "summary": A concise 2-3 sentence summary of what was discussed in this section.
- "highlights": An array of key points, decisions, or important topics (strings).
- "actionItems": An array of action items or follow-ups mentioned (strings). If none, use an empty array.

Respond ONLY with valid JSON. No markdown, no extra text.`;

function buildChunkPrompt(chunk: TranscriptChunk): string {
  const lines = chunk.segments.map(
    (s) => `${s.speaker}: ${s.text}`
  );
  return `Analyze this meeting transcript section:\n\n${lines.join('\n')}`;
}

/**
 * Enriches a chunk by calling the LLM and parsing the JSON response.
 */
async function enrichChunk(
  client: LlmClient,
  chunk: TranscriptChunk
): Promise<EnrichedChunkResult> {
  const response = await client.chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildChunkPrompt(chunk) },
  ]);

  // Parse the JSON response
  const parsed = JSON.parse(response) as {
    summary?: string;
    highlights?: string[];
    actionItems?: string[];
  };

  return {
    index: chunk.index,
    summary: parsed.summary ?? '',
    highlights: parsed.highlights ?? [],
    actionItems: parsed.actionItems ?? [],
  };
}

/**
 * Enriches a transcript's segments using LLM chunked processing.
 *
 * - Splits segments into ~3k-token chunks.
 * - Processes chunks in parallel.
 * - Merges results.
 * - On any failure: returns status='failed' with the original segments unchanged.
 *
 * @param segments - The transcript segments to enrich.
 * @param client - LLM client for API calls.
 * @returns Enrichment result with status, summary, highlights, action items.
 */
export async function enrichTranscript(
  segments: TranscriptSegment[],
  client: LlmClient
): Promise<EnrichmentResult> {
  if (segments.length === 0) {
    return {
      status: 'complete',
      summary: null,
      highlights: null,
      actionItems: null,
      segments,
    };
  }

  try {
    const chunks = chunkSegments(segments);

    // Process all chunks in parallel
    const chunkResults = await Promise.all(
      chunks.map((chunk) => enrichChunk(client, chunk))
    );

    const merged: MergedEnrichment = mergeEnrichedChunks(chunkResults);

    return {
      status: 'complete',
      summary: merged.summary || null,
      highlights: merged.highlights.length > 0 ? merged.highlights : null,
      actionItems: merged.actionItems.length > 0 ? merged.actionItems : null,
      segments,
    };
  } catch {
    // On failure: return transcript as-is with failed status
    return {
      status: 'failed',
      summary: null,
      highlights: null,
      actionItems: null,
      segments,
    };
  }
}
