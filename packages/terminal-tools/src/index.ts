// Auth
export { createTerminalTokenProvider } from './auth/terminal-token-provider.js';

// Config
export { env } from './config/env.js';
export type { TerminalToolsEnv } from './config/env.js';

// Formatters
export {
  formatTaskTable,
  formatAgenda,
  formatClientList,
  formatClientStatus,
  truncateTranscript,
} from './formatters/index.js';

// Errors
export { formatToolError } from './errors/error-handler.js';

// Schemas
export {
  shortTaskId,
  shortAgendaId,
  clientIdentifier,
  taskStatusFilter,
  GetAgendaInput,
  GetTasksInput,
  TriggerIntakeInput,
  TriggerAgendaInput,
  GetClientStatusInput,
  GetTranscriptInput,
  EditTaskInput,
  RejectTaskInput,
  ApproveTasksInput,
} from './schemas.js';

// Schema types (re-export for consumers)
export type {
  GetAgendaInput as GetAgendaInputType,
  GetTasksInput as GetTasksInputType,
  TriggerIntakeInput as TriggerIntakeInputType,
  TriggerAgendaInput as TriggerAgendaInputType,
  GetClientStatusInput as GetClientStatusInputType,
  GetTranscriptInput as GetTranscriptInputType,
  EditTaskInput as EditTaskInputType,
  RejectTaskInput as RejectTaskInputType,
  ApproveTasksInput as ApproveTasksInputType,
} from './schemas.js';
