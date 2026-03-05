/**
 * Maps a Grain API recording response to a NormalizedTranscript.
 *
 * Responsible for:
 *   - Setting source = "grain" and sourceId = recording ID.
 *   - Extracting meetingDate (started_at > created_at fallback).
 *   - Converting duration from ms if needed.
 *   - Delegating segment parsing to segment-parser.ts.
 *   - Setting summary and highlights to null.
 */

import type { NormalizedTranscript, MeetingType } from '@iexcel/shared-types';
import type { GrainRecording } from './grain-client.js';
import { parseGrainSegments, convertTimestamp, detectTimestampUnit } from './segment-parser.js';

export interface MapperInput {
  recording: GrainRecording;
  callType: MeetingType;
  clientId: string;
}

/**
 * Map a Grain recording to a NormalizedTranscript.
 * Throws if no transcript segments are present.
 */
export function mapGrainRecording(input: MapperInput): NormalizedTranscript {
  const { recording, callType, clientId } = input;

  // Extract meeting date: prefer started_at, fall back to created_at
  const meetingDate = recording.started_at ?? recording.created_at;

  // Parse segments
  const grainSegments = recording.transcript?.segments ?? [];
  const { segments, participants } = parseGrainSegments(grainSegments);

  // Calculate duration
  let durationSeconds = 0;
  if (recording.duration != null && recording.duration > 0) {
    // Detect if duration is in milliseconds (> 100_000 means ms)
    if (recording.duration > 100_000) {
      durationSeconds = Math.round(recording.duration / 1000);
    } else {
      durationSeconds = Math.round(recording.duration);
    }
  } else if (grainSegments.length > 0) {
    // Fallback: calculate from first and last segment timestamps
    const isMs = detectTimestampUnit(grainSegments);
    const firstTs = convertTimestamp(grainSegments[0]!.start_time, isMs);
    const lastSeg = grainSegments[grainSegments.length - 1]!;
    const lastTs = convertTimestamp(
      lastSeg.end_time ?? lastSeg.start_time,
      isMs
    );
    durationSeconds = Math.max(0, lastTs - firstTs);
  }

  return {
    source: 'grain',
    sourceId: recording.id,
    meetingDate,
    clientId,
    meetingType: callType,
    participants,
    durationSeconds,
    segments,
    summary: null,
    highlights: null,
  };
}
