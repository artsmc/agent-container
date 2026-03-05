/**
 * WorkflowService — Business logic for workflow orchestration.
 *
 * Handles triggering, status polling, and status updates for intake
 * and agenda workflows. Workflows are executed asynchronously via the
 * Mastra runtime, with status updates received via PATCH callback.
 */

import type { DbClient } from '../db/client';
import type { EnvConfig } from '../config/env';
import type { MastraAdapter } from '../adapters/mastra.adapter';
import type { WorkflowRunRecord } from '../repositories/workflow.repository';
import type { WorkflowResult, WorkflowError } from '../schemas/workflow.schemas';
import {
  createWorkflowRun,
  findWorkflowRunByIdOrThrow,
  findActiveRun,
  updateWorkflowRunStatus,
  findLastCompletedRun,
  countCompletedTasks,
} from '../repositories/workflow.repository';
import { getTranscriptById } from '../repositories/transcript-repository';
import { writeAudit } from './task-helpers';
import {
  ConflictError,
  UnprocessableError,
  ApiError,
} from '../errors/api-errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconciliationService {
  reconcileClient(clientId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Status transition rules
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['running', 'failed'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WorkflowService {
  constructor(
    private readonly db: DbClient,
    private readonly config: EnvConfig,
    private readonly mastraAdapter: MastraAdapter | null,
    private readonly reconciliationService: ReconciliationService | null
  ) {}

  // -------------------------------------------------------------------------
  // triggerIntake
  // -------------------------------------------------------------------------

  async triggerIntake(
    callerId: string,
    clientId: string,
    transcriptId: string
  ): Promise<WorkflowRunRecord> {
    // 1. Verify transcript belongs to client
    const transcript = await getTranscriptById(this.db, transcriptId);
    if (!transcript || transcript.client_id !== clientId) {
      throw new UnprocessableError('Transcript not found for this client');
    }

    // 2. Check for active run
    const activeRun = await findActiveRun(this.db, clientId, 'intake');
    if (activeRun) {
      throw new ConflictError(
        'A workflow is already running for this client. Please wait for it to complete before triggering another.'
      );
    }

    // 3. Create run record
    const run = await createWorkflowRun(this.db, {
      workflowType: 'intake',
      clientId,
      status: 'pending',
      inputRefs: { transcript_id: transcriptId },
      triggeredBy: callerId,
    });

    // 4. Audit log
    await writeAudit(this.db, {
      userId: callerId,
      action: 'workflow.triggered',
      entityType: 'workflow_run',
      entityId: run.id,
      metadata: {
        workflow_type: 'intake',
        client_id: clientId,
        transcript_id: transcriptId,
      },
      source: 'ui',
    });

    // 5. Fire-and-forget Mastra invocation
    if (this.mastraAdapter) {
      this.mastraAdapter
        .invokeWorkflowA({
          workflowRunId: run.id,
          clientId,
          transcriptId,
        })
        .catch((err: unknown) => {
          void this.handleInvocationFailure(run.id, err);
        });
    }

    return run;
  }

  // -------------------------------------------------------------------------
  // triggerAgenda
  // -------------------------------------------------------------------------

  async triggerAgenda(
    callerId: string,
    clientId: string,
    cycleStart?: string,
    cycleEnd?: string
  ): Promise<WorkflowRunRecord> {
    // 1. Check for active run
    const activeRun = await findActiveRun(this.db, clientId, 'agenda');
    if (activeRun) {
      throw new ConflictError(
        'A workflow is already running for this client. Please wait for it to complete before triggering another.'
      );
    }

    // 2. Resolve cycle dates
    const resolvedCycleStart =
      cycleStart ?? (await this.resolveCycleStart(clientId));
    const resolvedCycleEnd =
      cycleEnd ?? new Date().toISOString().split('T')[0];

    // 3. Trigger reconciliation (Feature 13)
    if (this.reconciliationService) {
      await this.reconciliationService.reconcileClient(clientId);
    }

    // 4. Check for completed tasks
    const completedTaskCount = await countCompletedTasks(
      this.db,
      clientId,
      resolvedCycleStart,
      resolvedCycleEnd
    );
    if (completedTaskCount === 0) {
      throw new UnprocessableError(
        'No completed tasks found for this client in the specified cycle window. ' +
          'Please ensure tasks have been marked complete in Asana before generating an agenda.'
      );
    }

    // 5. Create run record
    const run = await createWorkflowRun(this.db, {
      workflowType: 'agenda',
      clientId,
      status: 'pending',
      inputRefs: {
        cycle_start: resolvedCycleStart,
        cycle_end: resolvedCycleEnd,
      },
      triggeredBy: callerId,
    });

    // 6. Audit log
    await writeAudit(this.db, {
      userId: callerId,
      action: 'workflow.triggered',
      entityType: 'workflow_run',
      entityId: run.id,
      metadata: {
        workflow_type: 'agenda',
        client_id: clientId,
        cycle_start: resolvedCycleStart,
        cycle_end: resolvedCycleEnd,
      },
      source: 'ui',
    });

    // 7. Fire-and-forget Mastra invocation
    if (this.mastraAdapter) {
      this.mastraAdapter
        .invokeWorkflowB({
          workflowRunId: run.id,
          clientId,
          cycleStart: resolvedCycleStart,
          cycleEnd: resolvedCycleEnd,
        })
        .catch((err: unknown) => {
          void this.handleInvocationFailure(run.id, err);
        });
    }

    return run;
  }

  // -------------------------------------------------------------------------
  // getStatus
  // -------------------------------------------------------------------------

  async getStatus(
    _callerId: string,
    workflowRunId: string
  ): Promise<WorkflowRunRecord> {
    const run = await findWorkflowRunByIdOrThrow(this.db, workflowRunId);

    // Lazy timeout check
    if (run.status === 'pending' || run.status === 'running') {
      const ageMs = Date.now() - run.updatedAt.getTime();
      const timeoutMs = this.config.WORKFLOW_TIMEOUT_MS ?? 300_000;
      if (ageMs > timeoutMs) {
        return await this.markTimedOut(run);
      }
    }

    return run;
  }

  // -------------------------------------------------------------------------
  // updateStatus (Mastra callback)
  // -------------------------------------------------------------------------

  async updateStatus(
    workflowRunId: string,
    newStatus: 'running' | 'completed' | 'failed',
    result?: WorkflowResult,
    error?: WorkflowError
  ): Promise<WorkflowRunRecord> {
    const run = await findWorkflowRunByIdOrThrow(this.db, workflowRunId);

    // Validate transition
    const allowed = ALLOWED_TRANSITIONS[run.status];
    if (!allowed?.includes(newStatus)) {
      throw new ApiError(
        422,
        'INVALID_STATUS_TRANSITION',
        `Cannot transition workflow run from '${run.status}' to '${newStatus}'.`
      );
    }

    const completedAt =
      newStatus === 'completed' || newStatus === 'failed' ? new Date() : null;

    const updated = await updateWorkflowRunStatus(this.db, workflowRunId, {
      status: newStatus,
      result: result as Record<string, unknown> | undefined,
      error: error as Record<string, unknown> | undefined,
      completedAt,
    });

    // Determine audit action
    const action =
      newStatus === 'running'
        ? 'workflow.started'
        : newStatus === 'completed'
          ? 'workflow.completed'
          : 'workflow.failed';

    await writeAudit(this.db, {
      userId: run.triggeredBy ?? 'system',
      action,
      entityType: 'workflow_run',
      entityId: run.id,
      metadata: {
        workflow_type: run.workflowType,
        client_id: run.clientId,
        ...(result ? { result } : {}),
        ...(error ? { error } : {}),
      },
      source: 'agent',
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async markTimedOut(
    run: WorkflowRunRecord
  ): Promise<WorkflowRunRecord> {
    const updated = await updateWorkflowRunStatus(this.db, run.id, {
      status: 'failed',
      error: {
        code: 'WORKFLOW_TIMEOUT',
        message: 'Workflow did not complete within the allowed time.',
      },
      completedAt: new Date(),
    });

    await writeAudit(this.db, {
      userId: run.triggeredBy ?? 'system',
      action: 'workflow.timed_out',
      entityType: 'workflow_run',
      entityId: run.id,
      metadata: {
        workflow_type: run.workflowType,
        client_id: run.clientId,
      },
      source: 'agent',
    });

    return updated;
  }

  private async handleInvocationFailure(
    runId: string,
    err: unknown
  ): Promise<void> {
    try {
      await updateWorkflowRunStatus(this.db, runId, {
        status: 'failed',
        error: {
          code: 'MASTRA_INVOCATION_FAILED',
          message: String(err),
        },
        completedAt: new Date(),
      });
    } catch {
      // If we can't update the run, there's not much we can do.
      // The lazy timeout will eventually catch it.
      console.error(`Failed to mark workflow run ${runId} as failed:`, err);
    }
  }

  private async resolveCycleStart(clientId: string): Promise<string> {
    const lastRun = await findLastCompletedRun(this.db, clientId, 'agenda');
    if (lastRun?.completedAt) {
      return lastRun.completedAt.toISOString().split('T')[0];
    }
    // 30-day fallback
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
  }
}
