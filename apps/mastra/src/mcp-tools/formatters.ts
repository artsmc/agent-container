/**
 * Output formatters for MCP tool responses.
 *
 * All formatters produce plain text or Markdown suitable for display in
 * a terminal MCP client (Claude Code / Claw). No raw JSON, UUIDs, or
 * credential values are included in output.
 *
 * @see Feature 21 — FR-91, FR-92
 * @see TR.md — Section 6
 */
import type { NormalizedTask, Agenda, Client } from '@iexcel/shared-types';
import type { ClientStatusResponse } from '@iexcel/api-client';

/**
 * Truncate a string to a maximum length, appending "..." if truncated.
 */
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

/**
 * Format a task's estimated time for display.
 * Input is ISO 8601 duration or human-readable format.
 */
function formatTime(estimatedTime: string | null): string {
  if (!estimatedTime) return '-';
  return estimatedTime;
}

/**
 * Format tasks as a Markdown table with ID, Description, Time, Status columns.
 * Task descriptions are truncated to 60 characters.
 *
 * @see FRS.md — FR-91
 */
export function formatTaskTable(tasks: NormalizedTask[]): string {
  const header = '| ID       | Description                                                  | Time   | Status   |';
  const divider = '|----------|--------------------------------------------------------------|--------|----------|';
  const rows = tasks.map((t) => {
    const desc = truncate(t.title, 60);
    const time = formatTime(t.estimatedTime);
    return `| ${t.shortId.padEnd(8)} | ${desc.padEnd(60)} | ${time.padEnd(6)} | ${t.status.padEnd(8)} |`;
  });
  return [header, divider, ...rows].join('\n');
}

/**
 * Format a client status overview as key-value lines.
 *
 * @see FRS.md — FR-63
 */
export function formatClientStatus(
  clientName: string,
  status: ClientStatusResponse,
): string {
  const lines = [
    `Client: ${clientName}`,
    `Pending Approvals: ${status.pendingApprovals}`,
    `Agenda Ready: ${status.agendaReady ? 'Yes' : 'No'}`,
    `Next Call: ${status.nextCallDate ?? 'Not scheduled'}`,
  ];
  return lines.join('\n');
}

/**
 * Format a list of clients as a Markdown table.
 *
 * @see FRS.md — FR-73
 */
export function formatClientList(clients: Client[]): string {
  const header = '| Client Name                      | ID                                   |';
  const divider = '|----------------------------------|--------------------------------------|';
  const rows = clients.map(
    (c) => `| ${truncate(c.name, 32).padEnd(32)} | ${c.id.padEnd(36)} |`,
  );
  return [header, divider, ...rows].join('\n');
}

/**
 * Format an agenda for display.
 * Shows short ID, status, cycle dates, and content.
 */
export function formatAgenda(clientName: string, agenda: Agenda): string {
  const lines = [
    `Agenda ${agenda.shortId} for ${clientName}`,
    `Status: ${agenda.status}`,
    `Cycle: ${agenda.cycleStart} to ${agenda.cycleEnd}`,
    '',
    agenda.content,
  ];
  return lines.join('\n');
}

/**
 * Truncate transcript content to 2000 characters with a link to the full version.
 *
 * @see FRS.md — FR-92
 */
export function truncateTranscript(
  content: string,
  transcriptId: string,
  uiBaseUrl?: string,
): string {
  const MAX_LENGTH = 2000;
  if (content.length <= MAX_LENGTH) return content;

  const truncated = content.slice(0, MAX_LENGTH);
  const url = uiBaseUrl
    ? `${uiBaseUrl}/transcripts/${transcriptId}`
    : `transcripts/${transcriptId}`;
  return `${truncated}\n\n[Transcript truncated. View the full transcript at ${url}]`;
}

/**
 * Passthrough error formatter for consistency.
 */
export function formatError(message: string): string {
  return message;
}
