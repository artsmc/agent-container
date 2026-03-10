/**
 * Custom API route: POST /invoke
 *
 * Receives workflow invocation payloads from the API's MastraAdapter
 * and dispatches to the appropriate agent runner (intake or agenda).
 *
 * The route accepts immediately (202) and runs the agent asynchronously.
 */
import { runIntakeAgent } from '../agents/index.js';
import type { IntakeAgentInput } from '../agents/index.js';

interface InvocationPayload {
  workflowRunId: string;
  workflowType: 'intake' | 'agenda';
  clientId: string;
  transcriptId?: string;
  cycleStart?: string;
  cycleEnd?: string;
  callbackBaseUrl: string;
}

export const invokeRoute = {
  path: '/invoke',
  method: 'POST' as const,
  handler: async (c: any) => {
    const payload = (await c.req.json()) as InvocationPayload;

    if (!payload.workflowType || !payload.workflowRunId) {
      return c.json(
        { error: 'Missing required fields: workflowType, workflowRunId' },
        400
      );
    }

    if (payload.workflowType === 'intake') {
      if (!payload.transcriptId || !payload.clientId) {
        return c.json(
          { error: 'Missing required fields for intake: transcriptId, clientId' },
          400
        );
      }

      const input: IntakeAgentInput = {
        workflowRunId: payload.workflowRunId,
        clientId: payload.clientId,
        transcriptId: payload.transcriptId,
        callbackBaseUrl: payload.callbackBaseUrl,
      };

      // Run agent asynchronously but log errors visibly
      runIntakeAgent(input)
        .then(() => {
          console.log(`[invoke] Intake agent completed for workflow ${payload.workflowRunId}`);
        })
        .catch((err) => {
          console.error(`[invoke] Intake agent FAILED for workflow ${payload.workflowRunId}:`, err);
        });

      return c.json(
        { accepted: true, workflowRunId: payload.workflowRunId },
        202
      );
    }

    if (payload.workflowType === 'agenda') {
      // TODO: Wire up runAgendaAgent when implemented
      return c.json(
        { error: 'Agenda workflow invocation not yet implemented' },
        501
      );
    }

    return c.json({ error: `Unknown workflow type: ${payload.workflowType}` }, 400);
  },
};

/**
 * Debug route: POST /invoke-sync — runs agent synchronously and returns result.
 * Only for development/testing.
 */
export const invokeSyncRoute = {
  path: '/invoke-sync',
  method: 'POST' as const,
  handler: async (c: any) => {
    const payload = (await c.req.json()) as InvocationPayload;

    if (payload.workflowType !== 'intake' || !payload.transcriptId || !payload.clientId) {
      return c.json({ error: 'intake + transcriptId + clientId required' }, 400);
    }

    const input: IntakeAgentInput = {
      workflowRunId: payload.workflowRunId,
      clientId: payload.clientId,
      transcriptId: payload.transcriptId,
      callbackBaseUrl: payload.callbackBaseUrl,
    };

    try {
      const logger = {
        info: (msg: string, data?: Record<string, unknown>) => console.log(`[intake-sync] INFO: ${msg}`, JSON.stringify(data ?? {})),
        debug: (msg: string, data?: Record<string, unknown>) => console.log(`[intake-sync] DEBUG: ${msg}`, JSON.stringify(data ?? {})),
        warn: (msg: string, data?: Record<string, unknown>) => console.warn(`[intake-sync] WARN: ${msg}`, JSON.stringify(data ?? {})),
        error: (msg: string, data?: Record<string, unknown>) => console.error(`[intake-sync] ERROR: ${msg}`, JSON.stringify(data ?? {})),
      };
      await runIntakeAgent(input, logger);
      return c.json({ success: true }, 200);
    } catch (err) {
      console.error('[invoke-sync] EXCEPTION:', err);
      return c.json(
        { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined },
        500
      );
    }
  },
};
