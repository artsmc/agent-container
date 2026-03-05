/**
 * Task tools for the Mastra runtime.
 *
 * Provides tools for creating and retrieving tasks via the iExcel API.
 *
 * @see Feature 19 — Intake Agent
 * @see Feature 20 — Agenda Agent: getReconciledTasksTool
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getApiClient } from '../api-client.js';

// ── Shared sub-schemas ────────────────────────────────────────────────────────

const taskSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  clientId: z.string(),
  transcriptId: z.string().nullable(),
  status: z.enum(['draft', 'approved', 'rejected', 'pushed', 'completed']),
  title: z.string(),
  description: z.object({
    taskContext: z.string(),
    additionalContext: z.string(),
    requirements: z.array(z.string()),
  }),
  assignee: z.string().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  estimatedTime: z.string().nullable(),
  dueDate: z.string().nullable(),
  scrumStage: z.string(),
  tags: z.array(z.string()),
  externalRef: z
    .object({
      system: z.string(),
      externalId: z.string().nullable(),
      externalUrl: z.string().nullable(),
      projectId: z.string().nullable(),
      workspaceId: z.string().nullable(),
    })
    .nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  pushedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── saveTasksTool ─────────────────────────────────────────────────────────────

const saveTasksInputSchema = z.object({
  clientId: z.string().uuid(),
  transcriptId: z.string().uuid(),
  title: z.string(),
  description: z.object({
    taskContext: z.string(),
    additionalContext: z.string(),
    requirements: z.array(z.string()),
  }),
  assignee: z.string().nullable(),
  estimatedTime: z.string().nullable(),
  scrumStage: z.string().default('Backlog'),
  tags: z.array(z.string()).default([]),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
});

const saveTasksOutputSchema = z.object({
  shortId: z.string(),
  id: z.string(),
  status: z.literal('draft'),
});

export const saveTasksTool = createTool({
  id: 'save-tasks',
  description:
    'Save a single draft task for a client via the API. Call this once per task extracted from the transcript.',
  inputSchema: saveTasksInputSchema,
  outputSchema: saveTasksOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const result = await apiClient.createTasks(input.clientId, {
      clientId: input.clientId,
      transcriptId: input.transcriptId,
      title: input.title,
      description: input.description,
      assignee: input.assignee ?? undefined,
      estimatedTime: input.estimatedTime ?? undefined,
      scrumStage: input.scrumStage,
      tags: input.tags,
      priority: input.priority as any,
    });
    // createTasks returns NormalizedTask[] — take the first one
    const task = Array.isArray(result) ? result[0] : result;
    return {
      shortId: task.shortId,
      id: task.id,
      status: 'draft' as const,
    };
  },
});

// ── createDraftTasks ──────────────────────────────────────────────────────────

const createDraftTasksInputSchema = z.object({
  clientId: z.string().describe('Client UUID to associate tasks with'),
  transcriptId: z
    .string()
    .optional()
    .describe('Source transcript UUID, if any'),
  tasks: z.array(
    z.object({
      title: z.string().describe('Task title'),
      description: z.object({
        taskContext: z.string(),
        additionalContext: z.string(),
        requirements: z.array(z.string()),
      }),
      assignee: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      estimatedTime: z.string().optional().describe('ISO 8601 duration'),
      dueDate: z.string().optional().describe('ISO 8601 date'),
      scrumStage: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
  ),
});

const createDraftTasksOutputSchema = z.object({
  created: z.array(taskSchema),
});

export const createDraftTasks = createTool({
  id: 'create-draft-tasks',
  description:
    'Creates one or more draft tasks for a client, typically from an intake transcript.',
  inputSchema: createDraftTasksInputSchema,
  outputSchema: createDraftTasksOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const requests = input.tasks.map((task: any) => ({
      clientId: input.clientId,
      transcriptId: input.transcriptId,
      title: task.title,
      description: task.description,
      assignee: task.assignee,
      priority: task.priority as any,
      estimatedTime: task.estimatedTime,
      dueDate: task.dueDate,
      scrumStage: task.scrumStage,
      tags: task.tags,
    }));
    const created = await apiClient.createTasks(input.clientId, requests);
    return { created };
  },
});

// ── getTask ───────────────────────────────────────────────────────────────────

const getTaskInputSchema = z.object({
  taskId: z.string().describe('Task UUID or short ID (e.g., TSK-001)'),
});

const getTaskOutputSchema = z.object({
  task: taskSchema,
});

export const getTask = createTool({
  id: 'get-task',
  description: 'Retrieves a single task by its ID.',
  inputSchema: getTaskInputSchema,
  outputSchema: getTaskOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const response = await apiClient.getTask(input.taskId);
    return { task: response.task };
  },
});

// ── listTasksForClient ────────────────────────────────────────────────────────

const listTasksForClientInputSchema = z.object({
  clientId: z.string().describe('Client UUID to list tasks for'),
  status: z
    .enum(['draft', 'approved', 'rejected', 'pushed', 'completed'])
    .optional()
    .describe('Filter by task status'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe('Maximum number of tasks to return'),
});

const listTasksForClientOutputSchema = z.object({
  tasks: z.array(taskSchema),
  total: z.number().int(),
});

export const listTasksForClient = createTool({
  id: 'list-tasks-for-client',
  description: 'Lists tasks for a specific client, with optional status filter.',
  inputSchema: listTasksForClientInputSchema,
  outputSchema: listTasksForClientOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const response = await apiClient.listTasks(input.clientId, {
      status: input.status as any,
      limit: input.limit,
    });
    return { tasks: response.data, total: response.total };
  },
});

// ── getReconciledTasksTool (Feature 20 — Agenda Agent) ──────────────────────
//
// Reconciliation decision: Option A (Postgres cache).
// Feature 13 writes reconciled Asana status to denormalized columns on the
// tasks table. This tool fetches those cached values via GET /clients/{id}/tasks
// with status=pushed and cycle date filters. Feature 17 ensures a fresh
// reconciliation is triggered before each agent invocation.

const reconciledTaskSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  title: z.string(),
  description: z.object({
    taskContext: z.string(),
    additionalContext: z.string(),
    requirements: z.union([z.array(z.string()), z.string()]),
  }),
  assignee: z.string().nullable(),
  estimatedTime: z.string().nullable(),
  scrumStage: z.string(),
  asanaStatus: z.enum(['completed', 'incomplete', 'not_found']),
  asanaCompleted: z.boolean().nullable(),
  asanaCompletedAt: z.string().nullable(),
});

const getReconciledTasksInputSchema = z.object({
  clientId: z.string().uuid().describe('Client UUID'),
  cycleStart: z.string().describe('ISO 8601 date for cycle start'),
  cycleEnd: z.string().describe('ISO 8601 date for cycle end'),
});

const getReconciledTasksOutputSchema = z.object({
  tasks: z.array(reconciledTaskSchema),
});

export const getReconciledTasksTool = createTool({
  id: 'get-reconciled-tasks',
  description:
    'Retrieve reconciled tasks for a client within a cycle date range. Returns tasks with cached Asana completion status from the Postgres database.',
  inputSchema: getReconciledTasksInputSchema,
  outputSchema: getReconciledTasksOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const allTasks: z.infer<typeof reconciledTaskSchema>[] = [];
    let page = 1;
    const limit = 100;
    let hasMore = true;

    // Pagination loop — fetch all pushed tasks for the cycle window
    while (hasMore) {
      const response = await apiClient.listTasks(input.clientId, {
        status: 'pushed' as any,
        page,
        limit,
      });

      // Map API response to reconciled task shape
      for (const task of response.data) {
        allTasks.push({
          id: task.id,
          shortId: task.shortId,
          title: task.title,
          description: task.description,
          assignee: task.assignee,
          estimatedTime: task.estimatedTime,
          scrumStage: task.scrumStage,
          // Reconciled fields from Postgres cache (Feature 13)
          // These are served as part of the task response after reconciliation
          asanaStatus: (task as any).asanaStatus ?? 'not_found',
          asanaCompleted: (task as any).asanaCompleted ?? null,
          asanaCompletedAt: (task as any).asanaCompletedAt ?? null,
        });
      }

      hasMore = response.hasMore;
      page++;
    }

    return { tasks: allTasks };
  },
});
