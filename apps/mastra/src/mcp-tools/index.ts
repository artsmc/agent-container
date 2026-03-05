/**
 * Barrel export for all MCP tools.
 *
 * Exports each tool individually and a combined `mcpTools` record
 * for registration with the Mastra instance.
 *
 * @see Feature 21 — FR-02, FR-04
 */

// Read-only tools
export { listClientsTool } from './list-clients.js';
export { getClientStatusTool } from './get-client-status.js';
export { getAgendaTool } from './get-agenda.js';
export { getTasksTool } from './get-tasks.js';
export { getTranscriptTool } from './get-transcript.js';

// Workflow trigger tools
export { triggerIntakeTool } from './trigger-intake.js';
export { triggerAgendaTool } from './trigger-agenda.js';

// Task management tools
export { editTaskTool } from './edit-task.js';
export { rejectTaskTool } from './reject-task.js';
export { approveTasksTool } from './approve-tasks.js';

// Re-import for combined record
import { listClientsTool } from './list-clients.js';
import { getClientStatusTool } from './get-client-status.js';
import { getAgendaTool } from './get-agenda.js';
import { getTasksTool } from './get-tasks.js';
import { getTranscriptTool } from './get-transcript.js';
import { triggerIntakeTool } from './trigger-intake.js';
import { triggerAgendaTool } from './trigger-agenda.js';
import { editTaskTool } from './edit-task.js';
import { rejectTaskTool } from './reject-task.js';
import { approveTasksTool } from './approve-tasks.js';

/**
 * All 10 MCP tools keyed by their tool ID.
 * This record is passed to the Mastra `tools` config.
 */
export const mcpTools = {
  list_clients: listClientsTool,
  get_client_status: getClientStatusTool,
  get_agenda: getAgendaTool,
  get_tasks: getTasksTool,
  get_transcript: getTranscriptTool,
  trigger_intake: triggerIntakeTool,
  trigger_agenda: triggerAgendaTool,
  edit_task: editTaskTool,
  reject_task: rejectTaskTool,
  approve_tasks: approveTasksTool,
} as const;
