/**
 * Placeholder task tools for the Mastra runtime.
 *
 * These are stubs that satisfy the Mastra tool registry at runtime.
 * Full implementations ship in Feature 19 (Intake Agent Tools).
 *
 * @see Feature 19 — Intake Agent: task tool implementations
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

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
  execute: async (_input, _context) => {
    // TODO(feature-19): Implement via @iexcel/api-client POST /tasks
    throw new Error('Not implemented — see feature 19');
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
  execute: async (_input, _context) => {
    // TODO(feature-19): Implement via @iexcel/api-client GET /tasks/{id}
    throw new Error('Not implemented — see feature 19');
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
  execute: async (_input, _context) => {
    // TODO(feature-19): Implement via @iexcel/api-client GET /tasks?clientId=...
    throw new Error('Not implemented — see feature 19');
  },
});
