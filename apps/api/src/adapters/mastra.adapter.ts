/**
 * MastraAdapter — Async HTTP invocation of the Mastra runtime.
 *
 * Sends fire-and-forget workflow invocation requests to the Mastra service.
 * The actual LLM processing happens asynchronously in Mastra; this adapter
 * only triggers the job and confirms acceptance.
 *
 * TODO: Features 19/20 will implement the actual Mastra agent integration.
 * For now, the adapter sends HTTP POST to ${mastraBaseUrl}/invoke.
 */

export interface MastraInvocationPayload {
  workflowRunId: string;
  workflowType: 'intake' | 'agenda';
  clientId: string;
  transcriptId?: string;
  cycleStart?: string;
  cycleEnd?: string;
  callbackBaseUrl: string;
}

export interface InvokeWorkflowAParams {
  workflowRunId: string;
  clientId: string;
  transcriptId: string;
}

export interface InvokeWorkflowBParams {
  workflowRunId: string;
  clientId: string;
  cycleStart: string;
  cycleEnd: string;
}

export class MastraAdapter {
  constructor(
    private readonly mastraBaseUrl: string,
    private readonly apiBaseUrl: string,
    private readonly tokenProvider?: () => Promise<string>
  ) {}

  async invokeWorkflowA(params: InvokeWorkflowAParams): Promise<void> {
    await this.invoke({
      ...params,
      workflowType: 'intake',
      callbackBaseUrl: this.apiBaseUrl,
    });
  }

  async invokeWorkflowB(params: InvokeWorkflowBParams): Promise<void> {
    await this.invoke({
      ...params,
      workflowType: 'agenda',
      callbackBaseUrl: this.apiBaseUrl,
    });
  }

  private async invoke(payload: MastraInvocationPayload): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.tokenProvider) {
      const token = await this.tokenProvider();
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.mastraBaseUrl}/invoke`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Mastra invocation failed: HTTP ${res.status} — ${body}`);
    }
  }
}
