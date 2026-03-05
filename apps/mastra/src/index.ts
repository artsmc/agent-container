/**
 * Mastra runtime entry point for the iExcel Automation platform.
 *
 * Boot sequence:
 *   1. Validate and load environment (triggers API key injection)
 *   2. Initialise the service token manager (verifies auth connectivity)
 *   3. Initialize the shared API client (@iexcel/api-client)
 *   4. Construct and export the Mastra instance with agents and MCP tools
 *
 * The `mastra` named export follows Mastra's file-based convention — the
 * framework discovers agents, tools, and server config from this instance.
 *
 * MCP tools (Feature 21) are registered at the top level via the `tools`
 * config. Mastra exposes them via the built-in MCP server endpoint at /mcp.
 * All MCP tools use user token passthrough — the service token is NOT used
 * for MCP-originated calls.
 */

// Step 1 — Validate environment and inject LLM API key into process.env.
// This import has side-effects (validation + process.env mutation) and must
// run before any @mastra/core imports that read provider credentials.
import { env } from './config/env.js';

import { Mastra } from '@mastra/core';
import { createLogger, LogLevel } from '@mastra/core/logger';

import { ServiceTokenManager } from './auth/service-token.js';
import { initializeApiClient } from './api-client.js';
import { intakeAgent, agendaAgent } from './agents/index.js';
import { mcpTools } from './mcp-tools/index.js';

// Step 2 — Initialise service token manager.
const serviceTokenManager = new ServiceTokenManager({
  issuerUrl: env.AUTH_ISSUER_URL,
  clientId: env.MASTRA_CLIENT_ID,
  clientSecret: env.MASTRA_CLIENT_SECRET,
});

await serviceTokenManager.initialize();

// Step 3 — Initialize the shared API client.
// Uses @iexcel/api-client (Feature 22) with the service token manager.
initializeApiClient(serviceTokenManager);

// Step 4 — Construct the Mastra instance.
// The `mastra` export is the primary convention for Mastra framework discovery.
// MCP tools are registered under `tools` — Mastra's built-in MCP server
// exposes them at the /mcp endpoint (streamable HTTP transport).
export const mastra = new Mastra({
  agents: {
    intakeAgent,
    agendaAgent,
  },
  tools: {
    ...mcpTools,
  },
  server: {
    port: env.MASTRA_PORT,
    host: env.MASTRA_HOST,
  },
  logger: createLogger({
    name: env.OTEL_SERVICE_NAME,
    level: env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.INFO,
  }),
});
