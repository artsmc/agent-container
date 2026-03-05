import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for WorkflowService (Feature 17).
 *
 * These tests mock the repository, adapter, and helper layers
 * to test business logic in isolation.
 */

// Mock dependencies before importing the module under test
vi.mock('../../repositories/workflow.repository', () => ({
  createWorkflowRun: vi.fn(),
  findWorkflowRunByIdOrThrow: vi.fn(),
  findActiveRun: vi.fn(),
  updateWorkflowRunStatus: vi.fn(),
  findLastCompletedRun: vi.fn(),
  countCompletedTasks: vi.fn(),
}));

vi.mock('../../repositories/transcript-repository', () => ({
  getTranscriptById: vi.fn(),
}));

vi.mock('../../services/task-helpers', () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = {} as any;

import { WorkflowService } from '../../services/workflow.service';
import * as repo from '../../repositories/workflow.repository';
import * as transcriptRepo from '../../repositories/transcript-repository';

const validClientId = '00000000-0000-0000-0000-000000000001';
const validUserId = '00000000-0000-0000-0000-000000000099';
const validTranscriptId = '00000000-0000-0000-0000-000000000050';
const validRunId = '00000000-0000-0000-0000-000000000100';

const mockConfig = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  AUTH_ISSUER_URL: 'http://localhost:3100',
  AUTH_AUDIENCE: 'iexcel-api',
  PORT: 8080,
  HOST: '0.0.0.0',
  NODE_ENV: 'test' as const,
  LOG_LEVEL: 'silent' as const,
  CORS_ORIGINS: '*',
  MASTRA_CLIENT_ID: 'mastra-agent',
  WORKFLOW_TIMEOUT_MS: 300_000,
};

const mockMastraAdapter = {
  invokeWorkflowA: vi.fn().mockResolvedValue(undefined),
  invokeWorkflowB: vi.fn().mockResolvedValue(undefined),
};

const mockReconciliationService = {
  reconcileClient: vi.fn().mockResolvedValue(undefined),
};

function makeRun(overrides: Partial<repo.WorkflowRunRecord> = {}): repo.WorkflowRunRecord {
  return {
    id: validRunId,
    workflowType: 'intake',
    clientId: validClientId,
    status: 'pending',
    inputRefs: {},
    result: null,
    error: null,
    triggeredBy: validUserId,
    startedAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

describe('WorkflowService', () => {
  let svc: WorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svc = new WorkflowService(mockDb, mockConfig as any, mockMastraAdapter as any, mockReconciliationService);
  });

  // -----------------------------------------------------------------------
  // triggerIntake
  // -----------------------------------------------------------------------

  describe('triggerIntake', () => {
    it('creates a run record and returns it on success', async () => {
      const transcript = { id: validTranscriptId, client_id: validClientId };
      vi.mocked(transcriptRepo.getTranscriptById).mockResolvedValueOnce(transcript as any);
      vi.mocked(repo.findActiveRun).mockResolvedValueOnce(null);
      const createdRun = makeRun();
      vi.mocked(repo.createWorkflowRun).mockResolvedValueOnce(createdRun);

      const result = await svc.triggerIntake(validUserId, validClientId, validTranscriptId);

      expect(result).toEqual(createdRun);
      expect(repo.createWorkflowRun).toHaveBeenCalledWith(mockDb, expect.objectContaining({
        workflowType: 'intake',
        clientId: validClientId,
        status: 'pending',
        inputRefs: { transcript_id: validTranscriptId },
        triggeredBy: validUserId,
      }));
    });

    it('throws 422 when transcript not found', async () => {
      vi.mocked(transcriptRepo.getTranscriptById).mockResolvedValueOnce(null);

      await expect(svc.triggerIntake(validUserId, validClientId, validTranscriptId))
        .rejects.toThrow('Transcript not found');
    });

    it('throws 422 when transcript belongs to different client', async () => {
      const transcript = { id: validTranscriptId, client_id: 'different-client-id' };
      vi.mocked(transcriptRepo.getTranscriptById).mockResolvedValueOnce(transcript as any);

      await expect(svc.triggerIntake(validUserId, validClientId, validTranscriptId))
        .rejects.toThrow('Transcript not found');
    });

    it('throws 409 when active run exists', async () => {
      const transcript = { id: validTranscriptId, client_id: validClientId };
      vi.mocked(transcriptRepo.getTranscriptById).mockResolvedValueOnce(transcript as any);
      vi.mocked(repo.findActiveRun).mockResolvedValueOnce(makeRun({ status: 'running' }));

      await expect(svc.triggerIntake(validUserId, validClientId, validTranscriptId))
        .rejects.toThrow('already running');
    });

    it('calls Mastra adapter on success', async () => {
      const transcript = { id: validTranscriptId, client_id: validClientId };
      vi.mocked(transcriptRepo.getTranscriptById).mockResolvedValueOnce(transcript as any);
      vi.mocked(repo.findActiveRun).mockResolvedValueOnce(null);
      vi.mocked(repo.createWorkflowRun).mockResolvedValueOnce(makeRun());

      await svc.triggerIntake(validUserId, validClientId, validTranscriptId);

      expect(mockMastraAdapter.invokeWorkflowA).toHaveBeenCalledWith(expect.objectContaining({
        workflowRunId: validRunId,
        clientId: validClientId,
        transcriptId: validTranscriptId,
      }));
    });

    it('marks run as failed when Mastra invocation fails', async () => {
      const transcript = { id: validTranscriptId, client_id: validClientId };
      vi.mocked(transcriptRepo.getTranscriptById).mockResolvedValueOnce(transcript as any);
      vi.mocked(repo.findActiveRun).mockResolvedValueOnce(null);
      vi.mocked(repo.createWorkflowRun).mockResolvedValueOnce(makeRun());
      vi.mocked(repo.updateWorkflowRunStatus).mockResolvedValueOnce(makeRun({ status: 'failed' }));
      mockMastraAdapter.invokeWorkflowA.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await svc.triggerIntake(validUserId, validClientId, validTranscriptId);

      // The run is returned as pending (fire-and-forget)
      expect(result.status).toBe('pending');

      // Wait for the fire-and-forget to settle
      await new Promise((r) => setTimeout(r, 50));

      expect(repo.updateWorkflowRunStatus).toHaveBeenCalledWith(mockDb, validRunId, expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({ code: 'MASTRA_INVOCATION_FAILED' }),
      }));
    });
  });

  // -----------------------------------------------------------------------
  // triggerAgenda
  // -----------------------------------------------------------------------

  describe('triggerAgenda', () => {
    it('throws 409 when active run exists', async () => {
      vi.mocked(repo.findActiveRun).mockResolvedValueOnce(makeRun({ workflowType: 'agenda', status: 'running' }));

      await expect(svc.triggerAgenda(validUserId, validClientId))
        .rejects.toThrow('already running');
    });

    it('throws 422 when no completed tasks found', async () => {
      vi.mocked(repo.findActiveRun).mockResolvedValueOnce(null);
      vi.mocked(repo.findLastCompletedRun).mockResolvedValueOnce(null);
      vi.mocked(repo.countCompletedTasks).mockResolvedValueOnce(0);

      await expect(svc.triggerAgenda(validUserId, validClientId))
        .rejects.toThrow('No completed tasks');
    });

    it('creates a run record on success with explicit cycle dates', async () => {
      vi.mocked(repo.findActiveRun).mockResolvedValueOnce(null);
      vi.mocked(repo.countCompletedTasks).mockResolvedValueOnce(5);
      const createdRun = makeRun({ workflowType: 'agenda', inputRefs: { cycle_start: '2026-02-01', cycle_end: '2026-02-28' } });
      vi.mocked(repo.createWorkflowRun).mockResolvedValueOnce(createdRun);

      const result = await svc.triggerAgenda(validUserId, validClientId, '2026-02-01', '2026-02-28');

      expect(result.workflowType).toBe('agenda');
      expect(repo.createWorkflowRun).toHaveBeenCalledWith(mockDb, expect.objectContaining({
        workflowType: 'agenda',
        inputRefs: { cycle_start: '2026-02-01', cycle_end: '2026-02-28' },
      }));
    });

    it('resolves cycle dates from last completed run when not provided', async () => {
      const lastRun = makeRun({
        workflowType: 'agenda',
        status: 'completed',
        completedAt: new Date('2026-02-15T10:00:00Z'),
      });
      vi.mocked(repo.findActiveRun).mockResolvedValueOnce(null);
      vi.mocked(repo.findLastCompletedRun).mockResolvedValueOnce(lastRun);
      vi.mocked(repo.countCompletedTasks).mockResolvedValueOnce(3);
      vi.mocked(repo.createWorkflowRun).mockResolvedValueOnce(makeRun({ workflowType: 'agenda' }));

      await svc.triggerAgenda(validUserId, validClientId);

      expect(repo.countCompletedTasks).toHaveBeenCalledWith(
        mockDb,
        validClientId,
        '2026-02-15',
        expect.any(String)
      );
    });

    it('falls back to 30-day window when no prior run exists', async () => {
      vi.mocked(repo.findActiveRun).mockResolvedValueOnce(null);
      vi.mocked(repo.findLastCompletedRun).mockResolvedValueOnce(null);
      vi.mocked(repo.countCompletedTasks).mockResolvedValueOnce(2);
      vi.mocked(repo.createWorkflowRun).mockResolvedValueOnce(makeRun({ workflowType: 'agenda' }));

      await svc.triggerAgenda(validUserId, validClientId);

      // Verify that a cycle_start approximately 30 days ago was used
      const countCall = vi.mocked(repo.countCompletedTasks).mock.calls[0];
      const cycleStart = countCall?.[2];
      expect(cycleStart).toBeDefined();
      const daysAgo = (Date.now() - new Date(cycleStart!).getTime()) / (1000 * 60 * 60 * 24);
      expect(daysAgo).toBeGreaterThan(29);
      expect(daysAgo).toBeLessThan(31);
    });

    it('calls reconciliation service before checking completed tasks', async () => {
      vi.mocked(repo.findActiveRun).mockResolvedValueOnce(null);
      vi.mocked(repo.countCompletedTasks).mockResolvedValueOnce(5);
      vi.mocked(repo.findLastCompletedRun).mockResolvedValueOnce(null);
      vi.mocked(repo.createWorkflowRun).mockResolvedValueOnce(makeRun({ workflowType: 'agenda' }));

      await svc.triggerAgenda(validUserId, validClientId);

      expect(mockReconciliationService.reconcileClient).toHaveBeenCalledWith(validClientId);
    });
  });

  // -----------------------------------------------------------------------
  // getStatus
  // -----------------------------------------------------------------------

  describe('getStatus', () => {
    it('returns pending run unchanged when within timeout', async () => {
      const run = makeRun({ status: 'pending', updatedAt: new Date() });
      vi.mocked(repo.findWorkflowRunByIdOrThrow).mockResolvedValueOnce(run);

      const result = await svc.getStatus(validUserId, validRunId);

      expect(result.status).toBe('pending');
      expect(repo.updateWorkflowRunStatus).not.toHaveBeenCalled();
    });

    it('returns completed run unchanged', async () => {
      const run = makeRun({ status: 'completed', completedAt: new Date() });
      vi.mocked(repo.findWorkflowRunByIdOrThrow).mockResolvedValueOnce(run);

      const result = await svc.getStatus(validUserId, validRunId);

      expect(result.status).toBe('completed');
    });

    it('returns failed run unchanged', async () => {
      const run = makeRun({ status: 'failed', completedAt: new Date() });
      vi.mocked(repo.findWorkflowRunByIdOrThrow).mockResolvedValueOnce(run);

      const result = await svc.getStatus(validUserId, validRunId);

      expect(result.status).toBe('failed');
    });

    it('marks pending run as timed out when past timeout', async () => {
      const oldDate = new Date(Date.now() - 400_000); // 400 seconds ago
      const run = makeRun({ status: 'pending', updatedAt: oldDate });
      vi.mocked(repo.findWorkflowRunByIdOrThrow).mockResolvedValueOnce(run);
      const failedRun = makeRun({ status: 'failed', error: { code: 'WORKFLOW_TIMEOUT', message: 'timed out' } });
      vi.mocked(repo.updateWorkflowRunStatus).mockResolvedValueOnce(failedRun);

      const result = await svc.getStatus(validUserId, validRunId);

      expect(result.status).toBe('failed');
      expect(repo.updateWorkflowRunStatus).toHaveBeenCalledWith(mockDb, validRunId, expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({ code: 'WORKFLOW_TIMEOUT' }),
      }));
    });

    it('marks running run as timed out when past timeout', async () => {
      const oldDate = new Date(Date.now() - 400_000);
      const run = makeRun({ status: 'running', updatedAt: oldDate });
      vi.mocked(repo.findWorkflowRunByIdOrThrow).mockResolvedValueOnce(run);
      const failedRun = makeRun({ status: 'failed' });
      vi.mocked(repo.updateWorkflowRunStatus).mockResolvedValueOnce(failedRun);

      const result = await svc.getStatus(validUserId, validRunId);

      expect(result.status).toBe('failed');
    });
  });

  // -----------------------------------------------------------------------
  // updateStatus
  // -----------------------------------------------------------------------

  describe('updateStatus', () => {
    it('transitions pending to running', async () => {
      const run = makeRun({ status: 'pending' });
      vi.mocked(repo.findWorkflowRunByIdOrThrow).mockResolvedValueOnce(run);
      const updatedRun = makeRun({ status: 'running' });
      vi.mocked(repo.updateWorkflowRunStatus).mockResolvedValueOnce(updatedRun);

      const result = await svc.updateStatus(validRunId, 'running');

      expect(result.status).toBe('running');
    });

    it('transitions running to completed with result', async () => {
      const run = makeRun({ status: 'running' });
      vi.mocked(repo.findWorkflowRunByIdOrThrow).mockResolvedValueOnce(run);
      const updatedRun = makeRun({ status: 'completed', result: { task_short_ids: ['TSK-001'] } });
      vi.mocked(repo.updateWorkflowRunStatus).mockResolvedValueOnce(updatedRun);

      const result = await svc.updateStatus(validRunId, 'completed', { task_short_ids: ['TSK-001'] });

      expect(result.status).toBe('completed');
    });

    it('transitions running to failed with error', async () => {
      const run = makeRun({ status: 'running' });
      vi.mocked(repo.findWorkflowRunByIdOrThrow).mockResolvedValueOnce(run);
      const updatedRun = makeRun({ status: 'failed', error: { code: 'ERR', message: 'fail' } });
      vi.mocked(repo.updateWorkflowRunStatus).mockResolvedValueOnce(updatedRun);

      const result = await svc.updateStatus(validRunId, 'failed', undefined, { code: 'ERR', message: 'fail' });

      expect(result.status).toBe('failed');
    });

    it('rejects invalid transition pending to completed', async () => {
      const run = makeRun({ status: 'pending' });
      vi.mocked(repo.findWorkflowRunByIdOrThrow).mockResolvedValueOnce(run);

      await expect(svc.updateStatus(validRunId, 'completed'))
        .rejects.toThrow("Cannot transition workflow run from 'pending' to 'completed'.");
    });

    it('rejects transition from completed to any', async () => {
      const run = makeRun({ status: 'completed' });
      vi.mocked(repo.findWorkflowRunByIdOrThrow).mockResolvedValueOnce(run);

      await expect(svc.updateStatus(validRunId, 'running'))
        .rejects.toThrow("Cannot transition workflow run from 'completed' to 'running'.");
    });

    it('rejects transition from failed to any', async () => {
      const run = makeRun({ status: 'failed' });
      vi.mocked(repo.findWorkflowRunByIdOrThrow).mockResolvedValueOnce(run);

      await expect(svc.updateStatus(validRunId, 'running'))
        .rejects.toThrow("Cannot transition workflow run from 'failed' to 'running'.");
    });
  });
});
