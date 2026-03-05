import type { TaskSource } from './task';

/**
 * Branded string type for agenda short IDs.
 * Format: AGD-NNNN (e.g., AGD-0001)
 * Distinct brand from ShortId prevents cross-assignment.
 */
export type AgendaShortId = string & { readonly __brand: 'AgendaShortId' };

/**
 * Lifecycle statuses for an agenda (Running Notes document).
 */
export enum AgendaStatus {
  Draft = 'draft',
  InReview = 'in_review',
  Finalized = 'finalized',
  Shared = 'shared',
}

export interface Agenda {
  id: string;
  shortId: AgendaShortId;
  clientId: string;
  status: AgendaStatus;
  /** Markdown content of the Running Notes document. */
  content: string;
  /** ISO 8601 date string. e.g., "2026-02-01" */
  cycleStart: string;
  /** ISO 8601 date string. e.g., "2026-02-28" */
  cycleEnd: string;
  /** Null until POST /agendas/{id}/share is called. */
  sharedUrlToken: string | null;
  /** Null until POST /agendas/{id}/share is called. */
  internalUrlToken: string | null;
  /** Null until POST /agendas/{id}/export is called. */
  googleDocId: string | null;
  finalizedBy: string | null;
  finalizedAt: string | null;
  sharedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgendaVersion {
  id: string;
  agendaId: string;
  version: number;
  content: string;
  editedBy: string | null;
  source: TaskSource;
  createdAt: string;
}

export interface CreateAgendaRequest {
  clientId: string;
  content: string;
  cycleStart: string;
  cycleEnd: string;
}

export interface UpdateAgendaRequest {
  content?: string;
  cycleStart?: string;
  cycleEnd?: string;
}
