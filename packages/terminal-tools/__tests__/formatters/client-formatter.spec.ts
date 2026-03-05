import { describe, it, expect } from 'vitest';
import {
  formatClientList,
  formatClientStatus,
} from '../../src/formatters/client-formatter.js';
import type { Client } from '@iexcel/shared-types';
import type { ClientStatusResponse } from '@iexcel/api-client';

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'uuid-1',
    name: 'Total Life',
    grainPlaylistId: null,
    defaultAsanaWorkspaceId: null,
    defaultAsanaProjectId: null,
    emailRecipients: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

describe('formatClientList', () => {
  it('returns empty message when no clients', () => {
    const result = formatClientList([]);
    expect(result).toBe(
      'No clients found for your account. Contact your administrator.'
    );
  });

  it('returns custom empty message when provided', () => {
    const result = formatClientList([], 'No clients.');
    expect(result).toBe('No clients.');
  });

  it('formats a single client as a Markdown table', () => {
    const clients = [makeClient()];
    const result = formatClientList(clients);

    expect(result).toContain('| Client Name');
    expect(result).toContain('| Status');
    expect(result).toContain('Total Life');
    expect(result).toContain('active');
  });

  it('formats multiple clients', () => {
    const clients = [
      makeClient({ name: 'Total Life' }),
      makeClient({ id: 'uuid-2', name: 'Acme Corp' }),
      makeClient({ id: 'uuid-3', name: 'Old Client Co' }),
    ];
    const result = formatClientList(clients);
    const lines = result.split('\n');

    // Header + separator + 3 data rows
    expect(lines).toHaveLength(5);
    expect(result).toContain('Total Life');
    expect(result).toContain('Acme Corp');
    expect(result).toContain('Old Client Co');
  });
});

describe('formatClientStatus', () => {
  it('formats status with pending approvals', () => {
    const status: ClientStatusResponse = {
      clientId: 'uuid-1',
      pendingApprovals: 3,
      agendaReady: false,
      nextCallDate: '2026-03-07',
    };

    const result = formatClientStatus('Total Life', status);

    expect(result).toContain('Client: Total Life');
    expect(result).toContain('Draft Tasks: 3 pending approval');
    expect(result).toContain('Agenda: Not yet generated');
    expect(result).toContain('Next Call: 2026-03-07');
  });

  it('shows agenda as Ready when agendaReady is true', () => {
    const status: ClientStatusResponse = {
      clientId: 'uuid-1',
      pendingApprovals: 0,
      agendaReady: true,
      nextCallDate: null,
    };

    const result = formatClientStatus('Acme Corp', status);

    expect(result).toContain('Agenda: Ready');
    expect(result).toContain('Next Call: Not scheduled');
  });

  it('shows zero pending approvals', () => {
    const status: ClientStatusResponse = {
      clientId: 'uuid-1',
      pendingApprovals: 0,
      agendaReady: false,
      nextCallDate: null,
    };

    const result = formatClientStatus('Beta Ltd', status);
    expect(result).toContain('Draft Tasks: 0 pending approval');
  });
});
