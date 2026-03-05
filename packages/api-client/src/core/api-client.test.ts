import { describe, it, expect, vi } from 'vitest';
import { ApiClient, createApiClient } from './api-client';
import type { TokenProvider, ApiClientOptions } from '../types/client-options';

function createMockOptions(): ApiClientOptions {
  const tokenProvider: TokenProvider = {
    getAccessToken: vi.fn().mockResolvedValue('test-token'),
    refreshAccessToken: vi.fn().mockResolvedValue('refreshed-token'),
  };
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
    })
  );
  return {
    baseUrl: 'https://api.iexcel.test',
    tokenProvider,
    fetchImpl,
  };
}

describe('ApiClient', () => {
  it('should be created via createApiClient factory', () => {
    const options = createMockOptions();
    const client = createApiClient(options);
    expect(client).toBeInstanceOf(ApiClient);
  });

  it('should expose all auth methods', () => {
    const client = createApiClient(createMockOptions());
    expect(typeof client.getMe).toBe('function');
  });

  it('should expose all client methods', () => {
    const client = createApiClient(createMockOptions());
    expect(typeof client.listClients).toBe('function');
    expect(typeof client.getClient).toBe('function');
    expect(typeof client.updateClient).toBe('function');
    expect(typeof client.getClientStatus).toBe('function');
  });

  it('should expose all transcript methods', () => {
    const client = createApiClient(createMockOptions());
    expect(typeof client.listTranscripts).toBe('function');
    expect(typeof client.submitTranscript).toBe('function');
    expect(typeof client.getTranscript).toBe('function');
  });

  it('should expose all task methods', () => {
    const client = createApiClient(createMockOptions());
    expect(typeof client.listTasks).toBe('function');
    expect(typeof client.createTasks).toBe('function');
    expect(typeof client.getTask).toBe('function');
    expect(typeof client.updateTask).toBe('function');
    expect(typeof client.approveTask).toBe('function');
    expect(typeof client.rejectTask).toBe('function');
    expect(typeof client.pushTask).toBe('function');
    expect(typeof client.batchApproveTasks).toBe('function');
    expect(typeof client.batchPushTasks).toBe('function');
  });

  it('should expose all agenda methods', () => {
    const client = createApiClient(createMockOptions());
    expect(typeof client.listAgendas).toBe('function');
    expect(typeof client.createAgenda).toBe('function');
    expect(typeof client.getAgenda).toBe('function');
    expect(typeof client.updateAgenda).toBe('function');
    expect(typeof client.finalizeAgenda).toBe('function');
    expect(typeof client.shareAgenda).toBe('function');
    expect(typeof client.emailAgenda).toBe('function');
    expect(typeof client.exportAgenda).toBe('function');
    expect(typeof client.getSharedAgenda).toBe('function');
  });

  it('should expose all workflow methods', () => {
    const client = createApiClient(createMockOptions());
    expect(typeof client.triggerIntakeWorkflow).toBe('function');
    expect(typeof client.triggerAgendaWorkflow).toBe('function');
    expect(typeof client.getWorkflowStatus).toBe('function');
  });

  it('should expose all asana methods', () => {
    const client = createApiClient(createMockOptions());
    expect(typeof client.listAsanaWorkspaces).toBe('function');
    expect(typeof client.addAsanaWorkspace).toBe('function');
    expect(typeof client.deleteAsanaWorkspace).toBe('function');
  });

  it('should expose all import methods', () => {
    const client = createApiClient(createMockOptions());
    expect(typeof client.triggerImport).toBe('function');
    expect(typeof client.getImportStatus).toBe('function');
  });

  it('should expose audit method', () => {
    const client = createApiClient(createMockOptions());
    expect(typeof client.queryAuditLog).toBe('function');
  });

  it('should route requests through provided fetchImpl', async () => {
    const options = createMockOptions();
    const client = createApiClient(options);
    await client.getMe();

    expect(options.fetchImpl).toHaveBeenCalledOnce();
    const calledUrl = (options.fetchImpl as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(calledUrl).toBe('https://api.iexcel.test/me');
  });
});
