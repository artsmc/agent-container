/**
 * Ingest normalizers — format detection, SRT parsing, and turnbased preprocessing.
 *
 * Usage:
 *   import { detectFormat, buildSrtSegments, preprocessTurnbased } from '../normalizers/ingest';
 *   import { buildSegments } from '../normalizers/text/segment-builder';
 *
 * For SRT: use buildSrtSegments() directly (returns segments + participants + duration).
 * For turnbased: preprocessTurnbased() then buildSegments() from the text normalizer.
 * For raw: buildSegments() from the text normalizer handles it natively (Unknown fallback).
 */

export { detectFormat } from './format-detector.js';
export { buildSrtSegments, type SrtBuildResult } from './srt-segment-builder.js';
export { preprocessTurnbased } from './turnbased-preprocessor.js';
