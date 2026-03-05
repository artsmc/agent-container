import { describe, it, expect } from 'vitest';
import {
  shortTaskId,
  shortAgendaId,
  clientIdentifier,
  GetAgendaInput,
  GetTasksInput,
  TriggerIntakeInput,
  TriggerAgendaInput,
  GetClientStatusInput,
  GetTranscriptInput,
  EditTaskInput,
  RejectTaskInput,
  ApproveTasksInput,
} from '../src/schemas.js';

describe('shortTaskId', () => {
  it('accepts valid TSK IDs with 3 digits', () => {
    expect(shortTaskId.safeParse('TSK-001').success).toBe(true);
  });

  it('accepts valid TSK IDs with 4 digits', () => {
    expect(shortTaskId.safeParse('TSK-0042').success).toBe(true);
  });

  it('accepts valid TSK IDs with 5+ digits', () => {
    expect(shortTaskId.safeParse('TSK-12345').success).toBe(true);
  });

  it('rejects IDs with wrong prefix', () => {
    const result = shortTaskId.safeParse('TASK-0042');
    expect(result.success).toBe(false);
  });

  it('rejects IDs with too few digits', () => {
    const result = shortTaskId.safeParse('TSK-01');
    expect(result.success).toBe(false);
  });

  it('rejects IDs without digits', () => {
    const result = shortTaskId.safeParse('TSK-');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(shortTaskId.safeParse('').success).toBe(false);
  });
});

describe('shortAgendaId', () => {
  it('accepts valid AGD IDs', () => {
    expect(shortAgendaId.safeParse('AGD-0015').success).toBe(true);
  });

  it('accepts AGD IDs with 3 digits', () => {
    expect(shortAgendaId.safeParse('AGD-001').success).toBe(true);
  });

  it('rejects IDs with wrong prefix', () => {
    expect(shortAgendaId.safeParse('AGD0015').success).toBe(false);
  });
});

describe('clientIdentifier', () => {
  it('accepts non-empty strings', () => {
    expect(clientIdentifier.safeParse('Total Life').success).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(clientIdentifier.safeParse('').success).toBe(false);
  });
});

describe('GetAgendaInput', () => {
  it('accepts valid input', () => {
    expect(GetAgendaInput.safeParse({ client: 'Total Life' }).success).toBe(
      true
    );
  });

  it('rejects missing client', () => {
    expect(GetAgendaInput.safeParse({}).success).toBe(false);
  });
});

describe('GetTasksInput', () => {
  it('accepts client only', () => {
    expect(GetTasksInput.safeParse({ client: 'Total Life' }).success).toBe(
      true
    );
  });

  it('accepts client with status filter', () => {
    expect(
      GetTasksInput.safeParse({ client: 'Total Life', status: 'draft' }).success
    ).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(
      GetTasksInput.safeParse({ client: 'Total Life', status: 'invalid' })
        .success
    ).toBe(false);
  });
});

describe('TriggerIntakeInput', () => {
  it('accepts client only', () => {
    expect(
      TriggerIntakeInput.safeParse({ client: 'Total Life' }).success
    ).toBe(true);
  });

  it('accepts with optional fields', () => {
    expect(
      TriggerIntakeInput.safeParse({
        client: 'Total Life',
        transcript_source: 'https://grain.co/share/123',
        date: '2026-03-01',
      }).success
    ).toBe(true);
  });
});

describe('TriggerAgendaInput', () => {
  it('accepts client only', () => {
    expect(
      TriggerAgendaInput.safeParse({ client: 'Total Life' }).success
    ).toBe(true);
  });

  it('accepts with cycle dates', () => {
    expect(
      TriggerAgendaInput.safeParse({
        client: 'Total Life',
        cycle_start: '2026-02-01',
        cycle_end: '2026-02-28',
      }).success
    ).toBe(true);
  });
});

describe('GetClientStatusInput', () => {
  it('accepts valid input', () => {
    expect(
      GetClientStatusInput.safeParse({ client: 'Total Life' }).success
    ).toBe(true);
  });
});

describe('GetTranscriptInput', () => {
  it('accepts client only', () => {
    expect(
      GetTranscriptInput.safeParse({ client: 'Total Life' }).success
    ).toBe(true);
  });

  it('accepts client with date', () => {
    expect(
      GetTranscriptInput.safeParse({
        client: 'Total Life',
        date: '2026-03-01',
      }).success
    ).toBe(true);
  });
});

describe('EditTaskInput', () => {
  it('accepts valid edit with description', () => {
    expect(
      EditTaskInput.safeParse({
        id: 'TSK-0043',
        description: 'Updated description',
      }).success
    ).toBe(true);
  });

  it('accepts valid edit with estimated_time', () => {
    expect(
      EditTaskInput.safeParse({
        id: 'TSK-0043',
        estimated_time: '1h 30m',
      }).success
    ).toBe(true);
  });

  it('accepts valid edit with assignee', () => {
    expect(
      EditTaskInput.safeParse({
        id: 'TSK-0043',
        assignee: 'Mike',
      }).success
    ).toBe(true);
  });

  it('accepts valid edit with workspace', () => {
    expect(
      EditTaskInput.safeParse({
        id: 'TSK-0043',
        workspace: 'marketing',
      }).success
    ).toBe(true);
  });

  it('accepts valid edit with multiple fields', () => {
    expect(
      EditTaskInput.safeParse({
        id: 'TSK-0043',
        description: 'Updated',
        estimated_time: '2h 00m',
        assignee: 'Mike',
      }).success
    ).toBe(true);
  });

  it('rejects when no editable fields are provided (refinement)', () => {
    const result = EditTaskInput.safeParse({ id: 'TSK-0043' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toContain(
        'at least one field'
      );
    }
  });

  it('rejects invalid estimated_time format', () => {
    const result = EditTaskInput.safeParse({
      id: 'TSK-0043',
      estimated_time: '90 minutes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid task ID', () => {
    const result = EditTaskInput.safeParse({
      id: 'TASK-0043',
      description: 'Updated',
    });
    expect(result.success).toBe(false);
  });

  it('accepts estimated_time with zero hours', () => {
    expect(
      EditTaskInput.safeParse({
        id: 'TSK-0043',
        estimated_time: '0h 45m',
      }).success
    ).toBe(true);
  });
});

describe('RejectTaskInput', () => {
  it('accepts valid input without reason', () => {
    expect(RejectTaskInput.safeParse({ id: 'TSK-0044' }).success).toBe(true);
  });

  it('accepts valid input with reason', () => {
    expect(
      RejectTaskInput.safeParse({
        id: 'TSK-0044',
        reason: 'Out of scope',
      }).success
    ).toBe(true);
  });

  it('rejects invalid task ID', () => {
    expect(
      RejectTaskInput.safeParse({ id: 'bad-id' }).success
    ).toBe(false);
  });
});

describe('ApproveTasksInput', () => {
  it('accepts a single ID as string', () => {
    expect(
      ApproveTasksInput.safeParse({ ids: 'TSK-0042' }).success
    ).toBe(true);
  });

  it('accepts an array of IDs', () => {
    expect(
      ApproveTasksInput.safeParse({
        ids: ['TSK-0042', 'TSK-0043'],
      }).success
    ).toBe(true);
  });

  it('rejects empty array', () => {
    expect(ApproveTasksInput.safeParse({ ids: [] }).success).toBe(false);
  });

  it('rejects invalid IDs in array', () => {
    expect(
      ApproveTasksInput.safeParse({
        ids: ['TSK-0042', 'INVALID'],
      }).success
    ).toBe(false);
  });

  it('rejects missing ids field', () => {
    expect(ApproveTasksInput.safeParse({}).success).toBe(false);
  });
});
