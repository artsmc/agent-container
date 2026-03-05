import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveRouting } from '../workspace-router';
import type { WorkspaceConfig } from '../../../services/task-types';

// ---------------------------------------------------------------------------
// Mock database
// ---------------------------------------------------------------------------

function buildMockDb(
  wsRecord: Record<string, unknown> | null = null,
) {
  const selectObj = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(wsRecord ? [wsRecord] : []),
  };

  return {
    select: vi.fn().mockReturnValue(selectObj),
    _selectObj: selectObj,
  };
}

const VALID_CONFIG = {
  clientFieldGid: 'cf-client-001',
  scrumStageFieldGid: 'cf-scrum-001',
  estimatedTimeFieldGid: 'cf-esttime-001',
  estimatedTimeFormat: 'h_m',
};

const VALID_WORKSPACE_RECORD = {
  id: 'uuid-ws-001',
  asanaWorkspaceId: 'ws-gid-001',
  name: 'Test Workspace',
  accessTokenRef: 'secret-token-ref',
  customFieldConfig: VALID_CONFIG,
  createdAt: new Date(),
};

describe('resolveRouting', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns resolved routing with valid workspace record', async () => {
    const db = buildMockDb(VALID_WORKSPACE_RECORD);
    const workspace: WorkspaceConfig = {
      workspaceId: 'ws-gid-001',
      projectId: 'proj-gid-001',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await resolveRouting(workspace, db as any);

    expect(result).toEqual({
      workspaceGid: 'ws-gid-001',
      projectGid: 'proj-gid-001',
      accessToken: 'secret-token-ref',
      customFieldConfig: {
        clientFieldGid: 'cf-client-001',
        scrumStageFieldGid: 'cf-scrum-001',
        estimatedTimeFieldGid: 'cf-esttime-001',
        estimatedTimeFormat: 'h_m',
      },
    });
  });

  it('throws WORKSPACE_NOT_CONFIGURED when workspace GID not found in database', async () => {
    const db = buildMockDb(null);
    const workspace: WorkspaceConfig = {
      workspaceId: 'unknown-gid',
      projectId: 'proj-gid-001',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(resolveRouting(workspace, db as any)).rejects.toMatchObject({
      name: 'AdapterError',
      code: 'WORKSPACE_NOT_CONFIGURED',
      httpStatus: 422,
      details: { workspaceGid: 'unknown-gid' },
    });
  });

  it('throws WORKSPACE_NOT_CONFIGURED with missingFields when config is incomplete', async () => {
    const incompleteRecord = {
      ...VALID_WORKSPACE_RECORD,
      customFieldConfig: {
        clientFieldGid: 'cf-client-001',
        // Missing scrumStageFieldGid and estimatedTimeFieldGid
      },
    };
    const db = buildMockDb(incompleteRecord);
    const workspace: WorkspaceConfig = {
      workspaceId: 'ws-gid-001',
      projectId: 'proj-gid-001',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(resolveRouting(workspace, db as any)).rejects.toMatchObject({
      name: 'AdapterError',
      code: 'WORKSPACE_NOT_CONFIGURED',
      httpStatus: 422,
      details: {
        workspaceGid: 'ws-gid-001',
        missingFields: expect.arrayContaining([
          'scrumStageFieldGid',
          'estimatedTimeFieldGid',
        ]),
      },
    });
  });

  it('defaults estimatedTimeFormat to h_m when not specified', async () => {
    const recordWithoutFormat = {
      ...VALID_WORKSPACE_RECORD,
      customFieldConfig: {
        clientFieldGid: 'cf-client-001',
        scrumStageFieldGid: 'cf-scrum-001',
        estimatedTimeFieldGid: 'cf-esttime-001',
        // estimatedTimeFormat intentionally omitted
      },
    };
    const db = buildMockDb(recordWithoutFormat);
    const workspace: WorkspaceConfig = {
      workspaceId: 'ws-gid-001',
      projectId: 'proj-gid-001',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await resolveRouting(workspace, db as any);
    expect(result.customFieldConfig.estimatedTimeFormat).toBe('h_m');
  });

  it('falls back projectGid to workspaceGid when projectId is null', async () => {
    const db = buildMockDb(VALID_WORKSPACE_RECORD);
    const workspace: WorkspaceConfig = {
      workspaceId: 'ws-gid-001',
      projectId: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await resolveRouting(workspace, db as any);
    expect(result.projectGid).toBe('ws-gid-001');
  });
});
