/**
 * Client tools for the Mastra runtime.
 *
 * Provides tools for listing clients via the iExcel API.
 *
 * @see Feature 19 — Intake Agent
 */
import { createTool } from '@mastra/core/tools';
import type { ToolExecutionContext } from '@mastra/core/tools';
import { z } from 'zod';
import { getApiClient } from '../api-client.js';
import { extractToken } from '../mcp-tools/helpers/extract-token.js';
import { createUserApiClient } from '../mcp-tools/helpers/create-user-api-client.js';

// ── listClients ──────────────────────────────────────────────────────────────

export const listClients = createTool({
  id: 'list-clients',
  description:
    'Lists all clients. Use this to find the client ID when the user provides a client name.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    clients: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    ),
  }),
  execute: async (_input, context: ToolExecutionContext) => {
    const userToken = extractToken(context);
    const apiClient = userToken ? createUserApiClient(userToken) : getApiClient();
    const response = await apiClient.listClients();
    return {
      clients: response.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
    };
  },
});
