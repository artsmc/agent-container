export interface PlatformRecording {
  id: string;
  title: string;
  date: string;
  durationSeconds: number;
  participants: string[];
}

export interface ImportResult {
  recordingId: string;
  success: boolean;
  transcriptId?: string;
  versionId?: string;
  error?: string;
}

export interface IngestResult {
  transcriptId: string;
  versionId: string;
  version: number;
  format: string;
  matchStatus: string;
  enrichmentStatus: string;
  detectedPlatform?: string;
  recordingId?: string;
}

export type MeetingTypeOption = 'client_call' | 'intake' | 'follow_up';

export const MEETING_TYPE_OPTIONS: Array<{ value: MeetingTypeOption; label: string }> = [
  { value: 'client_call', label: 'Client Call' },
  { value: 'intake', label: 'Intake' },
  { value: 'follow_up', label: 'Follow Up' },
];
