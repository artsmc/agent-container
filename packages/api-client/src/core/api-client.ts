import type { ApiClientOptions } from '../types/client-options';
import { HttpTransport } from './http';
import { createAuthEndpoints } from '../endpoints/auth';
import { createClientEndpoints } from '../endpoints/clients';
import { createTranscriptEndpoints } from '../endpoints/transcripts';
import { createTaskEndpoints } from '../endpoints/tasks';
import { createAgendaEndpoints } from '../endpoints/agendas';
import { createWorkflowEndpoints } from '../endpoints/workflows';
import { createAsanaEndpoints } from '../endpoints/asana';
import { createImportEndpoints } from '../endpoints/import';
import { createAuditEndpoints } from '../endpoints/audit';

import type { AuthEndpoints } from '../endpoints/auth';
import type { ClientEndpoints } from '../endpoints/clients';
import type { TranscriptEndpoints } from '../endpoints/transcripts';
import type { TaskEndpoints } from '../endpoints/tasks';
import type { AgendaEndpoints } from '../endpoints/agendas';
import type { WorkflowEndpoints } from '../endpoints/workflows';
import type { AsanaEndpoints } from '../endpoints/asana';
import type { ImportEndpoints } from '../endpoints/import';
import type { AuditEndpoints } from '../endpoints/audit';

/**
 * Typed API client for the iExcel API.
 *
 * All endpoint methods are available as direct properties of this class.
 * Authentication is handled automatically via the injected TokenProvider.
 *
 * Usage:
 * ```ts
 * const client = createApiClient({ baseUrl, tokenProvider });
 * const me = await client.getMe();
 * const tasks = await client.listTasks('client-001', { status: 'draft' });
 * ```
 */
export class ApiClient
  implements
    AuthEndpoints,
    ClientEndpoints,
    TranscriptEndpoints,
    TaskEndpoints,
    AgendaEndpoints,
    WorkflowEndpoints,
    AsanaEndpoints,
    ImportEndpoints,
    AuditEndpoints
{
  // Auth
  public readonly getMe: AuthEndpoints['getMe'];

  // Clients
  public readonly listClients: ClientEndpoints['listClients'];
  public readonly createClient: ClientEndpoints['createClient'];
  public readonly getClient: ClientEndpoints['getClient'];
  public readonly updateClient: ClientEndpoints['updateClient'];
  public readonly getClientStatus: ClientEndpoints['getClientStatus'];

  // Transcripts
  public readonly listTranscripts: TranscriptEndpoints['listTranscripts'];
  public readonly listAllTranscripts: TranscriptEndpoints['listAllTranscripts'];
  public readonly submitTranscript: TranscriptEndpoints['submitTranscript'];
  public readonly getTranscript: TranscriptEndpoints['getTranscript'];
  public readonly updateTranscript: TranscriptEndpoints['updateTranscript'];
  public readonly parseTranscript: TranscriptEndpoints['parseTranscript'];

  // Tasks
  public readonly listTasks: TaskEndpoints['listTasks'];
  public readonly createTasks: TaskEndpoints['createTasks'];
  public readonly getTask: TaskEndpoints['getTask'];
  public readonly updateTask: TaskEndpoints['updateTask'];
  public readonly approveTask: TaskEndpoints['approveTask'];
  public readonly rejectTask: TaskEndpoints['rejectTask'];
  public readonly pushTask: TaskEndpoints['pushTask'];
  public readonly batchApproveTasks: TaskEndpoints['batchApproveTasks'];
  public readonly batchPushTasks: TaskEndpoints['batchPushTasks'];

  // Agendas
  public readonly listAgendas: AgendaEndpoints['listAgendas'];
  public readonly createAgenda: AgendaEndpoints['createAgenda'];
  public readonly getAgenda: AgendaEndpoints['getAgenda'];
  public readonly updateAgenda: AgendaEndpoints['updateAgenda'];
  public readonly finalizeAgenda: AgendaEndpoints['finalizeAgenda'];
  public readonly shareAgenda: AgendaEndpoints['shareAgenda'];
  public readonly emailAgenda: AgendaEndpoints['emailAgenda'];
  public readonly exportAgenda: AgendaEndpoints['exportAgenda'];
  public readonly getSharedAgenda: AgendaEndpoints['getSharedAgenda'];

  // Workflows
  public readonly triggerIntakeWorkflow: WorkflowEndpoints['triggerIntakeWorkflow'];
  public readonly triggerAgendaWorkflow: WorkflowEndpoints['triggerAgendaWorkflow'];
  public readonly getWorkflowStatus: WorkflowEndpoints['getWorkflowStatus'];
  public readonly updateWorkflowStatus: WorkflowEndpoints['updateWorkflowStatus'];

  // Asana
  public readonly listAsanaWorkspaces: AsanaEndpoints['listAsanaWorkspaces'];
  public readonly addAsanaWorkspace: AsanaEndpoints['addAsanaWorkspace'];
  public readonly deleteAsanaWorkspace: AsanaEndpoints['deleteAsanaWorkspace'];

  // Import
  public readonly triggerImport: ImportEndpoints['triggerImport'];
  public readonly getImportStatus: ImportEndpoints['getImportStatus'];

  // Audit
  public readonly queryAuditLog: AuditEndpoints['queryAuditLog'];

  constructor(options: ApiClientOptions) {
    const http = new HttpTransport(
      options.baseUrl,
      options.tokenProvider,
      options.fetchImpl ?? globalThis.fetch
    );

    // Compose endpoint groups
    const auth = createAuthEndpoints(http);
    const clients = createClientEndpoints(http);
    const transcripts = createTranscriptEndpoints(http);
    const tasks = createTaskEndpoints(http);
    const agendas = createAgendaEndpoints(http);
    const workflows = createWorkflowEndpoints(http);
    const asana = createAsanaEndpoints(http);
    const imports = createImportEndpoints(http);
    const audit = createAuditEndpoints(http);

    // Auth
    this.getMe = auth.getMe;

    // Clients
    this.listClients = clients.listClients;
    this.createClient = clients.createClient;
    this.getClient = clients.getClient;
    this.updateClient = clients.updateClient;
    this.getClientStatus = clients.getClientStatus;

    // Transcripts
    this.listTranscripts = transcripts.listTranscripts;
    this.listAllTranscripts = transcripts.listAllTranscripts;
    this.submitTranscript = transcripts.submitTranscript;
    this.getTranscript = transcripts.getTranscript;
    this.updateTranscript = transcripts.updateTranscript;
    this.parseTranscript = transcripts.parseTranscript;

    // Tasks
    this.listTasks = tasks.listTasks;
    this.createTasks = tasks.createTasks;
    this.getTask = tasks.getTask;
    this.updateTask = tasks.updateTask;
    this.approveTask = tasks.approveTask;
    this.rejectTask = tasks.rejectTask;
    this.pushTask = tasks.pushTask;
    this.batchApproveTasks = tasks.batchApproveTasks;
    this.batchPushTasks = tasks.batchPushTasks;

    // Agendas
    this.listAgendas = agendas.listAgendas;
    this.createAgenda = agendas.createAgenda;
    this.getAgenda = agendas.getAgenda;
    this.updateAgenda = agendas.updateAgenda;
    this.finalizeAgenda = agendas.finalizeAgenda;
    this.shareAgenda = agendas.shareAgenda;
    this.emailAgenda = agendas.emailAgenda;
    this.exportAgenda = agendas.exportAgenda;
    this.getSharedAgenda = agendas.getSharedAgenda;

    // Workflows
    this.triggerIntakeWorkflow = workflows.triggerIntakeWorkflow;
    this.triggerAgendaWorkflow = workflows.triggerAgendaWorkflow;
    this.getWorkflowStatus = workflows.getWorkflowStatus;
    this.updateWorkflowStatus = workflows.updateWorkflowStatus;

    // Asana
    this.listAsanaWorkspaces = asana.listAsanaWorkspaces;
    this.addAsanaWorkspace = asana.addAsanaWorkspace;
    this.deleteAsanaWorkspace = asana.deleteAsanaWorkspace;

    // Import
    this.triggerImport = imports.triggerImport;
    this.getImportStatus = imports.getImportStatus;

    // Audit
    this.queryAuditLog = audit.queryAuditLog;
  }
}

/**
 * Factory function to create an ApiClient instance.
 * This is the primary entry point for consumers.
 *
 * @param options - Configuration including baseUrl and tokenProvider
 * @returns A fully typed ApiClient instance
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}
