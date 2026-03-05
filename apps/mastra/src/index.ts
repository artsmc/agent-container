/**
 * Mastra runtime entry point for the iExcel Automation platform.
 *
 * Boot sequence:
 *   1. Validate and load environment (triggers API key injection)
 *   2. Initialise the service token manager (verifies auth connectivity)
 *   3. Create the API client stub (replaced by @iexcel/api-client in Feature 22)
 *   4. Construct and export the Mastra instance
 *
 * The `mastra` named export follows Mastra's file-based convention — the
 * framework discovers agents, tools, and server config from this instance.
 */

// Step 1 — Validate environment and inject LLM API key into process.env.
// This import has side-effects (validation + process.env mutation) and must
// run before any @mastra/core imports that read provider credentials.
import { env } from './config/env.js';

import { Mastra } from '@mastra/core';
import { createLogger, LogLevel } from '@mastra/core/logger';

import { ServiceTokenManager } from './auth/service-token.js';
import { createApiClient } from './api-client-stub.js';
import { intakeAgent, agendaAgent } from './agents/index.js';

// Step 2 — Initialise service token manager.
const serviceTokenManager = new ServiceTokenManager({
  issuerUrl: env.AUTH_ISSUER_URL,
  clientId: env.MASTRA_CLIENT_ID,
  clientSecret: env.MASTRA_CLIENT_SECRET,
});

await serviceTokenManager.initialize();

// Step 3 — Create the API client stub.
// Replace with: import { createApiClient } from '@iexcel/api-client' (Feature 22)
const _apiClient = createApiClient({
  baseUrl: env.API_BASE_URL,
  getAccessToken: () => serviceTokenManager.getToken(),
});

// Step 4 — Construct the Mastra instance.
// The `mastra` export is the primary convention for Mastra framework discovery.
export const mastra = new Mastra({
  agents: {
    intakeAgent,
    agendaAgent,
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
