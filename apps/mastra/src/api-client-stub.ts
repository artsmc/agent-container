/**
 * Minimal API client stub.
 *
 * Replace with @iexcel/api-client when Feature 22 ships.
 * This stub exists solely so Mastra tools can accept an API client at
 * construction time without importing a package that does not yet exist.
 *
 * @see Feature 22 — API Client Package: typed REST client for the iExcel API
 */

export interface ApiClientStub {
  /** Retrieve the bearer token for outbound API calls. */
  getAccessToken: () => Promise<string>;
  /** Base URL of the iExcel REST API. */
  baseUrl: string;

  // ── Task placeholders ─────────────────────────────────────────────────────
  /** @todo(feature-22): Implement with typed request/response shapes. */
  tasks: {
    create: (...args: unknown[]) => Promise<never>;
    get: (...args: unknown[]) => Promise<never>;
    list: (...args: unknown[]) => Promise<never>;
  };

  // ── Transcript placeholders ───────────────────────────────────────────────
  /** @todo(feature-22): Implement with typed request/response shapes. */
  transcripts: {
    get: (...args: unknown[]) => Promise<never>;
    list: (...args: unknown[]) => Promise<never>;
  };

  // ── Agenda placeholders ───────────────────────────────────────────────────
  /** @todo(feature-22): Implement with typed request/response shapes. */
  agendas: {
    create: (...args: unknown[]) => Promise<never>;
    get: (...args: unknown[]) => Promise<never>;
  };
}

function notImplemented(method: string): () => Promise<never> {
  return async () => {
    throw new Error(
      `ApiClientStub.${method} is not implemented — see Feature 22`
    );
  };
}

/**
 * Creates a minimal API client stub for use before Feature 22 is available.
 *
 * @param config.baseUrl      - Base URL of the iExcel REST API
 * @param config.getAccessToken - Token provider; typically ServiceTokenManager.getToken
 */
export function createApiClient(config: {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
}): ApiClientStub {
  return {
    baseUrl: config.baseUrl,
    getAccessToken: config.getAccessToken,
    tasks: {
      create: notImplemented('tasks.create'),
      get: notImplemented('tasks.get'),
      list: notImplemented('tasks.list'),
    },
    transcripts: {
      get: notImplemented('transcripts.get'),
      list: notImplemented('transcripts.list'),
    },
    agendas: {
      create: notImplemented('agendas.create'),
      get: notImplemented('agendas.get'),
    },
  };
}
