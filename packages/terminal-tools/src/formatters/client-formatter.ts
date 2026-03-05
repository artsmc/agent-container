/**
 * Formats Client arrays and ClientStatusResponse objects for
 * conversational terminal display.
 */

import type { Client } from '@iexcel/shared-types';
import type { ClientStatusResponse } from '@iexcel/api-client';

/**
 * Pads a string to exactly `width` characters (right-padded with spaces).
 */
function pad(text: string, width: number): string {
  return text.padEnd(width);
}

/**
 * Formats a Client array as a Markdown table.
 *
 * Columns: Client Name | Status
 *
 * Returns an empty-state message when the array is empty.
 */
export function formatClientList(
  clients: Client[],
  emptyMessage?: string
): string {
  if (clients.length === 0) {
    return (
      emptyMessage ??
      'No clients found for your account. Contact your administrator.'
    );
  }

  const nameWidth = Math.max(
    11,
    ...clients.map((c) => c.name.length)
  );
  const statusWidth = 8; // "inactive" is the longest status we show

  const header = `| ${pad('Client Name', nameWidth)} | ${pad('Status', statusWidth)} |`;
  const separator = `|${'-'.repeat(nameWidth + 2)}|${'-'.repeat(statusWidth + 2)}|`;

  const rows = clients.map((client) => {
    // Infer active/inactive from whether the client has been recently updated
    // For now we just show "active" — the API may add a status field later
    const status = 'active';
    return `| ${pad(client.name, nameWidth)} | ${pad(status, statusWidth)} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Formats a ClientStatusResponse as a key-value text summary
 * suitable for conversational display.
 */
export function formatClientStatus(
  clientName: string,
  status: ClientStatusResponse
): string {
  const lines: string[] = [
    `Client: ${clientName}`,
    `Draft Tasks: ${status.pendingApprovals} pending approval`,
    `Agenda: ${status.agendaReady ? 'Ready' : 'Not yet generated'}`,
    `Next Call: ${status.nextCallDate ?? 'Not scheduled'}`,
  ];

  return lines.join('\n');
}
