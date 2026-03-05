import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for import-job-service (Feature 38).
 *
 * These tests mock the database and repository layer to test
 * business logic in isolation.
 */

// Mock dependencies before importing the module under test
vi.mock('../../repositories/import-jobs-repository', () => ({
  createImportJob: vi.fn(),
  isJobInProgress: vi.fn(),
  getImportJobById: vi.fn(),
  getImportJobByIdForClient: vi.fn(),
  getMostRecentJobForClient: vi.fn(),
  getJobErrors: vi.fn(),
}));

vi.mock('../../services/client-service', () => ({
  getClientById: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock('../../workers/import-job-runner', () => ({
  runImportJob: vi.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = {} as any;

import {
  triggerImport,
  getImportStatus,
} from '../../services/import-job-service';
import * as repo from '../../repositories/import-jobs-repository';
import * as clientService from '../../services/client-service';

const validClientId = '00000000-0000-0000-0000-000000000001';
const validUserId = '00000000-0000-0000-0000-000000000099';

const mockClient = {
  id: validClientId,
  name: 'Test Client',
  grain_playlist_id: null,
  default_asana_workspace_id: 'ws-default-123',
  default_asana_project_id: null,
  email_recipients: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const mockJobRow = {
  id: '00000000-0000-0000-0000-000000000010',
  clientId: validClientId,
  status: 'pending',
  grainPlaylistId: 'grain-pl-abc',
  asanaProjectId: null,
  asanaWorkspaceId: null,
  reprocessTranscripts: false,
  callTypeOverride: null,
  transcriptsTotal: null,
  transcriptsImported: 0,
  tasksTotal: null,
  tasksImported: 0,
  agendasTotal: null,
  agendasImported: 0,
  errorSummary: null,
  startedAt: null,
  completedAt: null,
  createdBy: validUserId,
  createdAt: new Date('2026-03-05T10:00:00.000Z'),
};

describe('triggerImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientService.getClientById).mockResolvedValue(mockClient);
    vi.mocked(repo.isJobInProgress).mockResolvedValue({ inProgress: false });
    vi.mocked(repo.createImportJob).mockResolvedValue(mockJobRow as any);
    vi.mocked(clientService.writeAuditLog).mockResolvedValue(undefined);
  });

  it('creates an import job successfully with grain source', async () => {
    const result = await triggerImport(mockDb, {
      clientId: validClientId,
      userId: validUserId,
      userRole: 'account_manager',
      grainPlaylistId: 'grain-pl-abc',
    });

    expect(result.job_id).toBe(mockJobRow.id);
    expect(result.client_id).toBe(validClientId);
    expect(result.status).toBe('pending');
    expect(repo.createImportJob).toHaveBeenCalledOnce();
  });

  it('creates an import job successfully with asana source', async () => {
    const result = await triggerImport(mockDb, {
      clientId: validClientId,
      userId: validUserId,
      userRole: 'account_manager',
      asanaProjectId: 'asana-proj-123',
      asanaWorkspaceId: 'asana-ws-456',
    });

    expect(result.job_id).toBe(mockJobRow.id);
    expect(result.status).toBe('pending');
  });

  it('rejects team_member role with 403', async () => {
    await expect(
      triggerImport(mockDb, {
        clientId: validClientId,
        userId: validUserId,
        userRole: 'team_member',
        grainPlaylistId: 'grain-pl-abc',
      })
    ).rejects.toThrow('Team members cannot trigger historical imports');
  });

  it('returns 400 when neither source is provided', async () => {
    await expect(
      triggerImport(mockDb, {
        clientId: validClientId,
        userId: validUserId,
        userRole: 'account_manager',
      })
    ).rejects.toThrow('At least one source');
  });

  it('returns 409 when import is already in progress', async () => {
    vi.mocked(repo.isJobInProgress).mockResolvedValue({
      inProgress: true,
      existingJobId: 'existing-job-id',
    });

    await expect(
      triggerImport(mockDb, {
        clientId: validClientId,
        userId: validUserId,
        userRole: 'account_manager',
        grainPlaylistId: 'grain-pl-abc',
      })
    ).rejects.toThrow('already in progress');
  });

  it('returns 422 when asana_project_id provided but no workspace', async () => {
    vi.mocked(clientService.getClientById).mockResolvedValue({
      ...mockClient,
      default_asana_workspace_id: null,
    });

    await expect(
      triggerImport(mockDb, {
        clientId: validClientId,
        userId: validUserId,
        userRole: 'account_manager',
        asanaProjectId: 'proj-123',
      })
    ).rejects.toThrow('workspace');
  });

  it('falls back to client default workspace when not provided', async () => {
    await triggerImport(mockDb, {
      clientId: validClientId,
      userId: validUserId,
      userRole: 'account_manager',
      asanaProjectId: 'proj-123',
    });

    expect(repo.createImportJob).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        asanaWorkspaceId: 'ws-default-123',
      })
    );
  });

  it('returns 404 when client not found', async () => {
    vi.mocked(clientService.getClientById).mockResolvedValue(null);

    await expect(
      triggerImport(mockDb, {
        clientId: validClientId,
        userId: validUserId,
        userRole: 'account_manager',
        grainPlaylistId: 'grain-pl-abc',
      })
    ).rejects.toThrow('does not exist');
  });

  it('admin can trigger import for any client', async () => {
    const result = await triggerImport(mockDb, {
      clientId: validClientId,
      userId: validUserId,
      userRole: 'admin',
      grainPlaylistId: 'grain-pl-abc',
    });

    expect(result.status).toBe('pending');
  });
});

describe('getImportStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientService.getClientById).mockResolvedValue(mockClient);
  });

  it('returns most recent job when no job_id specified', async () => {
    vi.mocked(repo.getMostRecentJobForClient).mockResolvedValue({
      ...mockJobRow,
      status: 'completed',
      transcriptsImported: 5,
      transcriptsTotal: 5,
    } as any);
    vi.mocked(repo.getJobErrors).mockResolvedValue([]);

    const result = await getImportStatus(
      mockDb,
      validClientId,
      validUserId,
      'account_manager'
    );

    expect(result.status).toBe('completed');
    expect(result.progress.transcripts_imported).toBe(5);
  });

  it('returns specific job when job_id is provided', async () => {
    vi.mocked(repo.getImportJobByIdForClient).mockResolvedValue(mockJobRow as any);
    vi.mocked(repo.getJobErrors).mockResolvedValue([]);

    const result = await getImportStatus(
      mockDb,
      validClientId,
      validUserId,
      'account_manager',
      mockJobRow.id
    );

    expect(result.job_id).toBe(mockJobRow.id);
  });

  it('returns 404 when no import jobs exist', async () => {
    vi.mocked(repo.getMostRecentJobForClient).mockResolvedValue(null);

    await expect(
      getImportStatus(mockDb, validClientId, validUserId, 'account_manager')
    ).rejects.toThrow('No import jobs found');
  });

  it('includes error details in response', async () => {
    vi.mocked(repo.getMostRecentJobForClient).mockResolvedValue({
      ...mockJobRow,
      status: 'completed',
    } as any);
    vi.mocked(repo.getJobErrors).mockResolvedValue([
      {
        id: 'err-1',
        jobId: mockJobRow.id,
        entityType: 'transcript',
        sourceId: 'rec-001',
        errorCode: 'GRAIN_RECORDING_NOT_FOUND',
        errorMessage: 'Recording not found',
        occurredAt: new Date('2026-03-05T10:05:00.000Z'),
      },
    ]);

    const result = await getImportStatus(
      mockDb,
      validClientId,
      validUserId,
      'account_manager'
    );

    expect(result.error_details).toHaveLength(1);
    expect(result.error_details[0].entity_type).toBe('transcript');
    expect(result.error_details[0].source_id).toBe('rec-001');
  });
});
