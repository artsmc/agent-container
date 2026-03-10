import type { TranscriptSegment } from '@iexcel/shared-types';

/** Default maximum tokens per chunk. */
const DEFAULT_MAX_TOKENS = 3000;

/** Rough token estimation ratio: ~4 characters per token. */
const CHARS_PER_TOKEN = 4;

export interface TranscriptChunk {
  /** Zero-based chunk index. */
  index: number;
  /** Segments in this chunk. */
  segments: TranscriptSegment[];
  /** Estimated token count for this chunk. */
  estimatedTokens: number;
}

export interface EnrichedChunkResult {
  /** Zero-based chunk index (must match the original chunk). */
  index: number;
  /** Summary for this chunk's content. */
  summary: string;
  /** Highlights extracted from this chunk. */
  highlights: string[];
  /** Action items extracted from this chunk. */
  actionItems: string[];
}

export interface MergedEnrichment {
  summary: string;
  highlights: string[];
  actionItems: string[];
}

/**
 * Estimates the token count for a segment.
 */
function estimateSegmentTokens(segment: TranscriptSegment): number {
  // Include speaker name and text in the estimate
  const chars = segment.speaker.length + segment.text.length + 2; // +2 for ": "
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Splits transcript segments into chunks of approximately `maxTokens` each.
 *
 * Preserves segment boundaries -- a segment is never split across chunks.
 * If a single segment exceeds `maxTokens`, it is placed in its own chunk.
 *
 * @param segments - Ordered transcript segments.
 * @param maxTokens - Maximum estimated tokens per chunk (default: 3000).
 * @returns Ordered array of chunks.
 */
export function chunkSegments(
  segments: TranscriptSegment[],
  maxTokens: number = DEFAULT_MAX_TOKENS
): TranscriptChunk[] {
  if (segments.length === 0) {
    return [];
  }

  const chunks: TranscriptChunk[] = [];
  let currentSegments: TranscriptSegment[] = [];
  let currentTokens = 0;

  for (const segment of segments) {
    const segmentTokens = estimateSegmentTokens(segment);

    // If adding this segment would exceed the limit and we already have content,
    // finalize the current chunk first.
    if (currentSegments.length > 0 && currentTokens + segmentTokens > maxTokens) {
      chunks.push({
        index: chunks.length,
        segments: currentSegments,
        estimatedTokens: currentTokens,
      });
      currentSegments = [];
      currentTokens = 0;
    }

    currentSegments.push(segment);
    currentTokens += segmentTokens;
  }

  // Finalize the last chunk
  if (currentSegments.length > 0) {
    chunks.push({
      index: chunks.length,
      segments: currentSegments,
      estimatedTokens: currentTokens,
    });
  }

  return chunks;
}

/**
 * Merges enriched chunk results back into a single enrichment output.
 *
 * - Summaries are concatenated with paragraph breaks.
 * - Highlights and action items are concatenated in order, deduplicated.
 *
 * @param results - Enriched results from parallel LLM processing, in any order.
 * @returns Merged enrichment data.
 */
export function mergeEnrichedChunks(results: EnrichedChunkResult[]): MergedEnrichment {
  // Sort by chunk index to maintain document order
  const sorted = [...results].sort((a, b) => a.index - b.index);

  const summaryParts: string[] = [];
  const allHighlights: string[] = [];
  const allActionItems: string[] = [];

  for (const result of sorted) {
    if (result.summary) {
      summaryParts.push(result.summary);
    }
    allHighlights.push(...result.highlights);
    allActionItems.push(...result.actionItems);
  }

  return {
    summary: summaryParts.join('\n\n'),
    highlights: [...new Set(allHighlights)],
    actionItems: [...new Set(allActionItems)],
  };
}
