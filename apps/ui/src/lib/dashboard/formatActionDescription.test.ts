import { describe, it, expect } from 'vitest';
import { formatActionDescription } from './formatActionDescription';
import type { DashboardAuditEntry } from '@/types/dashboard';

function makeEntry(
  overrides: Partial<DashboardAuditEntry>
): DashboardAuditEntry {
  return {
    id: 'entry-1',
    actionType: 'task.approved',
    actor: { id: 'user-1', name: 'Alice', avatarUrl: null },
    entityType: 'task',
    entityId: 'TSK-0042',
    entityLabel: null,
    clientId: null,
    clientName: null,
    workflowName: null,
    createdAt: '2026-03-03T14:00:00Z',
    ...overrides,
  };
}

describe('formatActionDescription', () => {
  it('formats task.approved correctly', () => {
    const entry = makeEntry({ actionType: 'task.approved', entityId: 'TSK-0042' });
    expect(formatActionDescription(entry)).toBe('Approved task TSK-0042');
  });

  it('formats task.rejected correctly', () => {
    const entry = makeEntry({ actionType: 'task.rejected', entityId: 'TSK-0010' });
    expect(formatActionDescription(entry)).toBe('Rejected task TSK-0010');
  });

  it('formats task.pushed correctly', () => {
    const entry = makeEntry({ actionType: 'task.pushed', entityId: 'TSK-0010' });
    expect(formatActionDescription(entry)).toBe('Pushed task TSK-0010 to Asana');
  });

  it('formats agenda.shared correctly', () => {
    const entry = makeEntry({
      actionType: 'agenda.shared',
      entityId: 'AGD-0005',
      clientName: 'Acme Corp',
    });
    expect(formatActionDescription(entry)).toBe(
      'Shared agenda AGD-0005 with client Acme Corp'
    );
  });

  it('formats agenda.finalized correctly', () => {
    const entry = makeEntry({
      actionType: 'agenda.finalized',
      entityId: 'AGD-0005',
    });
    expect(formatActionDescription(entry)).toBe('Finalized agenda AGD-0005');
  });

  it('formats email.sent correctly', () => {
    const entry = makeEntry({
      actionType: 'email.sent',
      entityId: 'AGD-0005',
    });
    expect(formatActionDescription(entry)).toBe('Sent email for agenda AGD-0005');
  });

  it('formats workflow.triggered correctly', () => {
    const entry = makeEntry({
      actionType: 'workflow.triggered',
      workflowName: 'Intake \u2192 Tasks',
      clientName: 'Globex Corp',
    });
    expect(formatActionDescription(entry)).toBe(
      'Triggered Intake \u2192 Tasks for Globex Corp'
    );
  });

  it('formats unknown action type with fallback', () => {
    const entry = makeEntry({
      actionType: 'unknown.action',
      entityType: 'task',
      entityId: 'TSK-0099',
    });
    expect(formatActionDescription(entry)).toBe(
      'Performed action on task TSK-0099'
    );
  });

  it('handles agenda.shared with null clientName', () => {
    const entry = makeEntry({
      actionType: 'agenda.shared',
      entityId: 'AGD-0005',
      clientName: null,
    });
    expect(formatActionDescription(entry)).toBe(
      'Shared agenda AGD-0005 with client Unknown'
    );
  });

  it('handles workflow.triggered with null workflowName', () => {
    const entry = makeEntry({
      actionType: 'workflow.triggered',
      workflowName: null,
      clientName: null,
    });
    expect(formatActionDescription(entry)).toBe(
      'Triggered workflow for Unknown'
    );
  });
});
