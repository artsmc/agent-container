import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { createLogger, LogLevel } from '@mastra/core/logger';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';

"use strict";
const envSchema = z.object({
  // External API dependencies
  API_BASE_URL: z.string().url("API_BASE_URL must be a valid URL"),
  AUTH_ISSUER_URL: z.string().url("AUTH_ISSUER_URL must be a valid URL"),
  // Mastra service identity
  MASTRA_CLIENT_ID: z.string().min(1, "MASTRA_CLIENT_ID is required"),
  MASTRA_CLIENT_SECRET: z.string().min(1, "MASTRA_CLIENT_SECRET is required"),
  // LLM configuration
  LLM_API_KEY: z.string().min(1, "LLM_API_KEY is required"),
  LLM_PROVIDER: z.enum(["openai", "anthropic"]).default("anthropic"),
  LLM_MODEL: z.string().default("claude-sonnet-4-20250514"),
  // Server configuration
  MASTRA_PORT: z.coerce.number().int().positive().default(8081),
  MASTRA_HOST: z.string().default("0.0.0.0"),
  // Runtime
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Observability (optional)
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default("iexcel-mastra")
});
function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(
      `Mastra environment validation failed:
${formatted}

Ensure all required variables are set in your .env file.`
    );
  }
  return result.data;
}
const env = parseEnv();
if (env.LLM_PROVIDER === "openai") {
  process.env["OPENAI_API_KEY"] = env.LLM_API_KEY;
} else {
  process.env["ANTHROPIC_API_KEY"] = env.LLM_API_KEY;
}

"use strict";
class AuthClientError extends Error {
  code;
  cause;
  constructor(message, code, cause) {
    super(message);
    this.name = "AuthClientError";
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
class DiscoveryError extends AuthClientError {
  constructor(message, cause) {
    super(message, "DISCOVERY_ERROR", cause);
    this.name = "DiscoveryError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
class TokenValidationError extends AuthClientError {
  reason;
  constructor(message, reason, cause) {
    super(message, "TOKEN_VALIDATION_ERROR", cause);
    this.name = "TokenValidationError";
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
class TokenRefreshError extends AuthClientError {
  oauthError;
  constructor(message, oauthError, cause) {
    super(message, "TOKEN_REFRESH_ERROR", cause);
    this.name = "TokenRefreshError";
    this.oauthError = oauthError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
class AuthCallbackError extends AuthClientError {
  reason;
  constructor(message, reason, cause) {
    super(message, "AUTH_CALLBACK_ERROR", cause);
    this.name = "AuthCallbackError";
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
class DeviceFlowError extends AuthClientError {
  reason;
  constructor(message, reason, cause) {
    super(message, "DEVICE_FLOW_ERROR", cause);
    this.name = "DeviceFlowError";
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
class ClientCredentialsError extends AuthClientError {
  oauthError;
  constructor(message, oauthError, cause) {
    super(message, "CLIENT_CREDENTIALS_ERROR", cause);
    this.name = "ClientCredentialsError";
    this.oauthError = oauthError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
class TokenStorageError extends AuthClientError {
  constructor(message, cause) {
    super(message, "TOKEN_STORAGE_ERROR", cause);
    this.name = "TokenStorageError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

"use strict";

"use strict";

"use strict";

"use strict";

"use strict";
const DEFAULT_CACHE_TTL_MS = 36e5;
const cache = /* @__PURE__ */ new Map();
async function getDiscoveryDocument(issuerUrl, options) {
  const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const now = Date.now();
  const cached = cache.get(issuerUrl);
  if (cached !== void 0 && cached.expiresAt > now) {
    return cached.document;
  }
  const discoveryUrl = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
  let response;
  try {
    response = await fetchImpl(discoveryUrl, {
      headers: { Accept: "application/json" }
    });
  } catch (cause) {
    throw new DiscoveryError(
      `Network error fetching discovery document from ${discoveryUrl}`,
      cause
    );
  }
  if (!response.ok) {
    throw new DiscoveryError(
      `Discovery endpoint returned HTTP ${response.status} for ${discoveryUrl}`
    );
  }
  let document;
  try {
    document = await response.json();
  } catch (cause) {
    throw new DiscoveryError(
      `Failed to parse discovery document from ${discoveryUrl} as JSON`,
      cause
    );
  }
  if (typeof document !== "object" || document === null || !("issuer" in document) || typeof document["issuer"] !== "string") {
    throw new DiscoveryError(
      `Invalid discovery document from ${discoveryUrl}: missing required "issuer" field`
    );
  }
  const typed = document;
  cache.set(issuerUrl, {
    document: typed,
    expiresAt: now + cacheTtlMs
  });
  return typed;
}
function clearDiscoveryCache() {
  cache.clear();
}

"use strict";

"use strict";
const DEFAULT_EXPIRY_BUFFER_SECONDS = 60;
function isSuccess(body) {
  return typeof body === "object" && body !== null && "access_token" in body && typeof body["access_token"] === "string";
}
function isError(body) {
  return typeof body === "object" && body !== null && "error" in body && typeof body["error"] === "string";
}
function createClientCredentialsClient(config) {
  const {
    issuerUrl,
    clientId,
    clientSecret,
    scope,
    expiryBufferSeconds = DEFAULT_EXPIRY_BUFFER_SECONDS,
    fetchImpl = fetch
  } = config;
  let cachedToken;
  let inFlightRequest;
  async function fetchToken() {
    let tokenEndpoint;
    try {
      const discovery = await getDiscoveryDocument(issuerUrl, { fetchImpl });
      tokenEndpoint = discovery.token_endpoint;
    } catch (cause) {
      throw new ClientCredentialsError(
        `Failed to resolve token endpoint for issuer ${issuerUrl}`,
        void 0,
        cause
      );
    }
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    });
    if (scope !== void 0) {
      params.set("scope", scope);
    }
    let response;
    try {
      response = await fetchImpl(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: params.toString()
      });
    } catch (cause) {
      throw new ClientCredentialsError(
        `Network error posting to token endpoint ${tokenEndpoint}`,
        void 0,
        cause
      );
    }
    let body;
    try {
      body = await response.json();
    } catch (cause) {
      throw new ClientCredentialsError(
        "Failed to parse token endpoint response as JSON",
        void 0,
        cause
      );
    }
    if (!response.ok || isError(body)) {
      const oauthError = isError(body) ? body.error : void 0;
      const description = isError(body) ? body.error_description : void 0;
      throw new ClientCredentialsError(
        description ?? `Client credentials grant failed with HTTP ${response.status}`,
        oauthError
      );
    }
    if (!isSuccess(body)) {
      throw new ClientCredentialsError(
        "Token endpoint returned an unexpected response shape"
      );
    }
    const now = Math.floor(Date.now() / 1e3);
    const expiresAt = body.expires_in !== void 0 ? now + body.expires_in - expiryBufferSeconds : now + 3600 - expiryBufferSeconds;
    cachedToken = {
      accessToken: body.access_token,
      expiresAt
    };
    return body.access_token;
  }
  function isTokenFresh() {
    if (cachedToken === void 0) return false;
    return Math.floor(Date.now() / 1e3) < cachedToken.expiresAt;
  }
  async function getAccessToken() {
    if (isTokenFresh() && cachedToken !== void 0) {
      return cachedToken.accessToken;
    }
    if (inFlightRequest !== void 0) {
      return inFlightRequest;
    }
    inFlightRequest = fetchToken().finally(() => {
      inFlightRequest = void 0;
    });
    return inFlightRequest;
  }
  async function forceRefresh() {
    cachedToken = void 0;
    if (inFlightRequest !== void 0) {
      return inFlightRequest;
    }
    inFlightRequest = fetchToken().finally(() => {
      inFlightRequest = void 0;
    });
    return inFlightRequest;
  }
  return { getAccessToken, forceRefresh };
}

"use strict";

"use strict";
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5e3;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
class ServiceTokenManager {
  client;
  constructor(config) {
    this.client = createClientCredentialsClient({
      issuerUrl: config.issuerUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scope: config.scopes
    });
  }
  /**
   * Validates connectivity to the auth issuer at startup by fetching an
   * initial token. Retries up to RETRY_ATTEMPTS times with RETRY_DELAY_MS
   * between each attempt before throwing.
   *
   * Call this once during application boot before registering agents.
   */
  async initialize() {
    let lastError;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        await this.client.getAccessToken();
        return;
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS);
        }
      }
    }
    throw new Error(
      `ServiceTokenManager failed to obtain an initial token after ${RETRY_ATTEMPTS} attempts. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }
  /**
   * Returns a valid access token, refreshing transparently if needed.
   * Safe to call on every outbound request — the underlying client
   * returns the cached token when it is still fresh.
   */
  async getToken() {
    return this.client.getAccessToken();
  }
}

"use strict";
class ApiClientError extends Error {
  constructor(message, code, statusCode, details) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
  name = "ApiClientError";
}

"use strict";
class HttpTransport {
  baseUrl;
  tokenProvider;
  fetchImpl;
  constructor(baseUrl, tokenProvider, fetchImpl) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl.bind(globalThis);
  }
  /**
   * Execute an HTTP request with automatic token attachment and 401 retry.
   */
  async request(options) {
    const url = this.buildUrl(options.path, options.params);
    const hasBody = options.body !== void 0;
    const headers = await this.buildHeaders(options.skipAuth, hasBody);
    const init = {
      method: options.method,
      headers,
      body: options.body !== void 0 ? JSON.stringify(options.body) : void 0
    };
    let response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (err) {
      throw new ApiClientError(
        err instanceof Error ? err.message : "Network request failed",
        "NETWORK_ERROR",
        0,
        { cause: err instanceof Error ? err.message : String(err) }
      );
    }
    if (response.status === 401 && !options.skipAuth) {
      let newToken;
      try {
        newToken = await this.tokenProvider.refreshAccessToken();
      } catch (err) {
        throw new ApiClientError(
          "Token refresh failed",
          "NETWORK_ERROR",
          0,
          { cause: err instanceof Error ? err.message : String(err) }
        );
      }
      headers.set("Authorization", `Bearer ${newToken}`);
      const retryInit = {
        method: options.method,
        headers,
        body: options.body !== void 0 ? JSON.stringify(options.body) : void 0
      };
      try {
        response = await this.fetchImpl(url, retryInit);
      } catch (err) {
        throw new ApiClientError(
          err instanceof Error ? err.message : "Network request failed",
          "NETWORK_ERROR",
          0,
          { cause: err instanceof Error ? err.message : String(err) }
        );
      }
    }
    if (!response.ok) {
      return this.throwParsedError(response);
    }
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return void 0;
    }
    return response.json();
  }
  /**
   * Build a full URL from the base, path, and optional query parameters.
   * Undefined and null parameter values are omitted from the query string.
   */
  buildUrl(path, params) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== void 0 && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }
  /**
   * Build request headers with Content-Type, Accept, and optional Authorization.
   */
  async buildHeaders(skipAuth, hasBody) {
    const headers = new Headers({
      "Accept": "application/json"
    });
    if (hasBody) {
      headers.set("Content-Type", "application/json");
    }
    if (!skipAuth) {
      const token = await this.tokenProvider.getAccessToken();
      headers.set("Authorization", `Bearer ${token}`);
    }
    return headers;
  }
  /**
   * Parse the error response body and throw a typed ApiClientError.
   * Attempts JSON parsing first; falls back to raw text for non-JSON responses.
   */
  async throwParsedError(response) {
    let rawText;
    try {
      rawText = await response.text();
    } catch {
      throw new ApiClientError(
        "Failed to read error response",
        "UNKNOWN_ERROR",
        response.status
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new ApiClientError(
        "Unexpected non-JSON error response",
        "UNKNOWN_ERROR",
        response.status,
        { rawBody: rawText }
      );
    }
    const errorBody = parsed;
    if (errorBody?.error?.code) {
      throw new ApiClientError(
        errorBody.error.message,
        errorBody.error.code,
        response.status,
        errorBody.error.details
      );
    }
    throw new ApiClientError(
      "Unknown API error",
      "UNKNOWN_ERROR",
      response.status,
      { rawBody: parsed }
    );
  }
}

"use strict";
function createAuthEndpoints(http) {
  return {
    /**
     * Get the current authenticated user's profile.
     * GET /me
     */
    getMe() {
      return http.request({ method: "GET", path: "/me" });
    }
  };
}

"use strict";
function createClientEndpoints(http) {
  return {
    /**
     * List all clients with optional pagination.
     * GET /clients
     */
    listClients(params) {
      return http.request({
        method: "GET",
        path: "/clients",
        params
      });
    },
    /**
     * Create a new client.
     * POST /clients
     */
    createClient(body) {
      return http.request({
        method: "POST",
        path: "/clients",
        body
      });
    },
    /**
     * Get a single client by ID.
     * GET /clients/{id}
     */
    getClient(clientId) {
      return http.request({ method: "GET", path: `/clients/${clientId}` });
    },
    /**
     * Update a client's details.
     * PATCH /clients/{id}
     */
    updateClient(clientId, body) {
      return http.request({
        method: "PATCH",
        path: `/clients/${clientId}`,
        body
      });
    },
    /**
     * Get a client's dashboard status.
     * GET /clients/{id}/status
     */
    getClientStatus(clientId) {
      return http.request({
        method: "GET",
        path: `/clients/${clientId}/status`
      });
    }
  };
}

"use strict";
function createTranscriptEndpoints(http) {
  return {
    /**
     * List transcripts for a given client with optional pagination.
     * GET /clients/{id}/transcripts
     */
    listTranscripts(clientId, params) {
      return http.request({
        method: "GET",
        path: `/clients/${clientId}/transcripts`,
        params
      });
    },
    /**
     * List all transcripts accessible to the authenticated user.
     * GET /transcripts
     */
    listAllTranscripts(params) {
      return http.request({
        method: "GET",
        path: "/transcripts",
        params
      });
    },
    /**
     * Submit a new transcript for a client.
     * POST /clients/{id}/transcripts
     */
    submitTranscript(clientId, body) {
      return http.request({
        method: "POST",
        path: `/clients/${clientId}/transcripts`,
        body
      });
    },
    /**
     * Get a single transcript by ID.
     * GET /transcripts/{id}
     */
    getTranscript(transcriptId) {
      return http.request({
        method: "GET",
        path: `/transcripts/${transcriptId}`
      });
    },
    /**
     * Update a transcript (e.g. assign a client).
     * PATCH /transcripts/{id}
     */
    updateTranscript(transcriptId, body) {
      return http.request({
        method: "PATCH",
        path: `/transcripts/${transcriptId}`,
        body
      });
    }
  };
}

"use strict";
function createTaskEndpoints(http) {
  return {
    /**
     * List tasks for a client with optional filtering and pagination.
     * GET /clients/{id}/tasks
     */
    listTasks(clientId, params) {
      return http.request({
        method: "GET",
        path: `/clients/${clientId}/tasks`,
        params
      });
    },
    /**
     * Create one or more tasks for a client.
     * POST /clients/{id}/tasks
     */
    createTasks(clientId, body) {
      return http.request({
        method: "POST",
        path: `/clients/${clientId}/tasks`,
        body
      });
    },
    /**
     * Get a single task by UUID or short ID. Includes version history.
     * GET /tasks/{id}
     */
    getTask(taskId) {
      return http.request({ method: "GET", path: `/tasks/${taskId}` });
    },
    /**
     * Update a task's editable fields.
     * PATCH /tasks/{id}
     */
    updateTask(taskId, body) {
      return http.request({
        method: "PATCH",
        path: `/tasks/${taskId}`,
        body
      });
    },
    /**
     * Approve a task, transitioning it from draft to approved.
     * POST /tasks/{id}/approve
     */
    approveTask(taskId) {
      return http.request({
        method: "POST",
        path: `/tasks/${taskId}/approve`
      });
    },
    /**
     * Reject a task with an optional reason.
     * POST /tasks/{id}/reject
     */
    rejectTask(taskId, body) {
      return http.request({
        method: "POST",
        path: `/tasks/${taskId}/reject`,
        body
      });
    },
    /**
     * Push an approved task to the external PM system.
     * POST /tasks/{id}/push
     */
    pushTask(taskId) {
      return http.request({
        method: "POST",
        path: `/tasks/${taskId}/push`
      });
    },
    /**
     * Batch approve multiple tasks for a client.
     * POST /clients/{id}/tasks/approve
     */
    batchApproveTasks(clientId, body) {
      return http.request({
        method: "POST",
        path: `/clients/${clientId}/tasks/approve`,
        body
      });
    },
    /**
     * Batch push multiple approved tasks for a client.
     * POST /clients/{id}/tasks/push
     */
    batchPushTasks(clientId, body) {
      return http.request({
        method: "POST",
        path: `/clients/${clientId}/tasks/push`,
        body
      });
    }
  };
}

"use strict";
function createAgendaEndpoints(http) {
  return {
    /**
     * List agendas for a client with optional pagination.
     * GET /clients/{id}/agendas
     */
    listAgendas(clientId, params) {
      return http.request({
        method: "GET",
        path: `/clients/${clientId}/agendas`,
        params
      });
    },
    /**
     * Create a new agenda for a client.
     * POST /clients/{id}/agendas
     */
    createAgenda(clientId, body) {
      return http.request({
        method: "POST",
        path: `/clients/${clientId}/agendas`,
        body
      });
    },
    /**
     * Get a single agenda by UUID or short ID. Includes version history.
     * GET /agendas/{id}
     */
    getAgenda(agendaId) {
      return http.request({ method: "GET", path: `/agendas/${agendaId}` });
    },
    /**
     * Update an agenda's content or cycle dates.
     * PATCH /agendas/{id}
     */
    updateAgenda(agendaId, body) {
      return http.request({
        method: "PATCH",
        path: `/agendas/${agendaId}`,
        body
      });
    },
    /**
     * Finalize an agenda, preventing further edits.
     * POST /agendas/{id}/finalize
     */
    finalizeAgenda(agendaId) {
      return http.request({
        method: "POST",
        path: `/agendas/${agendaId}/finalize`
      });
    },
    /**
     * Generate a shareable link for an agenda.
     * POST /agendas/{id}/share
     */
    shareAgenda(agendaId) {
      return http.request({
        method: "POST",
        path: `/agendas/${agendaId}/share`
      });
    },
    /**
     * Email an agenda to recipients. Uses client defaults if no body provided.
     * POST /agendas/{id}/email
     */
    emailAgenda(agendaId, body) {
      return http.request({
        method: "POST",
        path: `/agendas/${agendaId}/email`,
        body
      });
    },
    /**
     * Export an agenda to Google Docs.
     * POST /agendas/{id}/export
     */
    exportAgenda(agendaId) {
      return http.request({
        method: "POST",
        path: `/agendas/${agendaId}/export`
      });
    },
    /**
     * Get a shared agenda by its share token. This is a public endpoint
     * that does not require authentication.
     * GET /shared/{token}
     */
    getSharedAgenda(shareToken) {
      return http.request({
        method: "GET",
        path: `/shared/${shareToken}`,
        skipAuth: true
      });
    }
  };
}

"use strict";
function createWorkflowEndpoints(http) {
  return {
    /**
     * Trigger the intake workflow for a client transcript.
     * POST /workflows/intake
     */
    triggerIntakeWorkflow(body) {
      return http.request({
        method: "POST",
        path: "/workflows/intake",
        body
      });
    },
    /**
     * Trigger the agenda generation workflow for a client cycle.
     * POST /workflows/agenda
     */
    triggerAgendaWorkflow(body) {
      return http.request({
        method: "POST",
        path: "/workflows/agenda",
        body
      });
    },
    /**
     * Get the status of a running workflow.
     * GET /workflows/{id}/status
     */
    getWorkflowStatus(workflowId) {
      return http.request({
        method: "GET",
        path: `/workflows/${workflowId}/status`
      });
    },
    /**
     * Update the status of a workflow run.
     * PATCH /workflows/{id}/status
     * Used by Mastra agents to report progress and completion.
     */
    updateWorkflowStatus(workflowId, body) {
      return http.request({
        method: "PATCH",
        path: `/workflows/${workflowId}/status`,
        body
      });
    }
  };
}

"use strict";
function createAsanaEndpoints(http) {
  return {
    /**
     * List all configured Asana workspaces.
     * GET /asana/workspaces
     */
    listAsanaWorkspaces() {
      return http.request({
        method: "GET",
        path: "/asana/workspaces"
      });
    },
    /**
     * Add a new Asana workspace configuration.
     * POST /asana/workspaces
     */
    addAsanaWorkspace(body) {
      return http.request({
        method: "POST",
        path: "/asana/workspaces",
        body
      });
    },
    /**
     * Delete an Asana workspace configuration.
     * DELETE /asana/workspaces/{id}
     */
    deleteAsanaWorkspace(workspaceId) {
      return http.request({
        method: "DELETE",
        path: `/asana/workspaces/${workspaceId}`
      });
    }
  };
}

"use strict";
function createImportEndpoints(http) {
  return {
    /**
     * Trigger an import job for a client.
     * POST /clients/{id}/import
     */
    triggerImport(clientId, body) {
      return http.request({
        method: "POST",
        path: `/clients/${clientId}/import`,
        body
      });
    },
    /**
     * Get the current import status for a client.
     * GET /clients/{id}/import/status
     */
    getImportStatus(clientId) {
      return http.request({
        method: "GET",
        path: `/clients/${clientId}/import/status`
      });
    }
  };
}

"use strict";
function mapAuditParams(params) {
  return {
    entity_type: params.entityType,
    entity_id: params.entityId,
    user_id: params.userId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    page: params.page,
    limit: params.limit
  };
}
function createAuditEndpoints(http) {
  return {
    /**
     * Query the audit log with optional filters.
     * GET /audit
     */
    queryAuditLog(params) {
      return http.request({
        method: "GET",
        path: "/audit",
        params: mapAuditParams(params)
      });
    }
  };
}

"use strict";
class ApiClient {
  // Auth
  getMe;
  // Clients
  listClients;
  createClient;
  getClient;
  updateClient;
  getClientStatus;
  // Transcripts
  listTranscripts;
  listAllTranscripts;
  submitTranscript;
  getTranscript;
  updateTranscript;
  // Tasks
  listTasks;
  createTasks;
  getTask;
  updateTask;
  approveTask;
  rejectTask;
  pushTask;
  batchApproveTasks;
  batchPushTasks;
  // Agendas
  listAgendas;
  createAgenda;
  getAgenda;
  updateAgenda;
  finalizeAgenda;
  shareAgenda;
  emailAgenda;
  exportAgenda;
  getSharedAgenda;
  // Workflows
  triggerIntakeWorkflow;
  triggerAgendaWorkflow;
  getWorkflowStatus;
  updateWorkflowStatus;
  // Asana
  listAsanaWorkspaces;
  addAsanaWorkspace;
  deleteAsanaWorkspace;
  // Import
  triggerImport;
  getImportStatus;
  // Audit
  queryAuditLog;
  constructor(options) {
    const http = new HttpTransport(
      options.baseUrl,
      options.tokenProvider,
      options.fetchImpl ?? globalThis.fetch
    );
    const auth = createAuthEndpoints(http);
    const clients = createClientEndpoints(http);
    const transcripts = createTranscriptEndpoints(http);
    const tasks = createTaskEndpoints(http);
    const agendas = createAgendaEndpoints(http);
    const workflows = createWorkflowEndpoints(http);
    const asana = createAsanaEndpoints(http);
    const imports = createImportEndpoints(http);
    const audit = createAuditEndpoints(http);
    this.getMe = auth.getMe;
    this.listClients = clients.listClients;
    this.createClient = clients.createClient;
    this.getClient = clients.getClient;
    this.updateClient = clients.updateClient;
    this.getClientStatus = clients.getClientStatus;
    this.listTranscripts = transcripts.listTranscripts;
    this.listAllTranscripts = transcripts.listAllTranscripts;
    this.submitTranscript = transcripts.submitTranscript;
    this.getTranscript = transcripts.getTranscript;
    this.updateTranscript = transcripts.updateTranscript;
    this.listTasks = tasks.listTasks;
    this.createTasks = tasks.createTasks;
    this.getTask = tasks.getTask;
    this.updateTask = tasks.updateTask;
    this.approveTask = tasks.approveTask;
    this.rejectTask = tasks.rejectTask;
    this.pushTask = tasks.pushTask;
    this.batchApproveTasks = tasks.batchApproveTasks;
    this.batchPushTasks = tasks.batchPushTasks;
    this.listAgendas = agendas.listAgendas;
    this.createAgenda = agendas.createAgenda;
    this.getAgenda = agendas.getAgenda;
    this.updateAgenda = agendas.updateAgenda;
    this.finalizeAgenda = agendas.finalizeAgenda;
    this.shareAgenda = agendas.shareAgenda;
    this.emailAgenda = agendas.emailAgenda;
    this.exportAgenda = agendas.exportAgenda;
    this.getSharedAgenda = agendas.getSharedAgenda;
    this.triggerIntakeWorkflow = workflows.triggerIntakeWorkflow;
    this.triggerAgendaWorkflow = workflows.triggerAgendaWorkflow;
    this.getWorkflowStatus = workflows.getWorkflowStatus;
    this.updateWorkflowStatus = workflows.updateWorkflowStatus;
    this.listAsanaWorkspaces = asana.listAsanaWorkspaces;
    this.addAsanaWorkspace = asana.addAsanaWorkspace;
    this.deleteAsanaWorkspace = asana.deleteAsanaWorkspace;
    this.triggerImport = imports.triggerImport;
    this.getImportStatus = imports.getImportStatus;
    this.queryAuditLog = audit.queryAuditLog;
  }
}
function createApiClient(options) {
  return new ApiClient(options);
}

"use strict";

"use strict";

"use strict";
let _apiClient = null;
let _serviceTokenManager = null;
function initializeApiClient(serviceTokenManager) {
  _serviceTokenManager = serviceTokenManager;
  _apiClient = createApiClient({
    baseUrl: env.API_BASE_URL,
    tokenProvider: {
      getAccessToken: () => serviceTokenManager.getToken(),
      refreshAccessToken: () => serviceTokenManager.getToken()
    }
  });
}
function getApiClient() {
  if (!_apiClient) {
    throw new Error(
      "API client not initialized. Call initializeApiClient() during boot."
    );
  }
  return _apiClient;
}

"use strict";
const INTAKE_AGENT_INSTRUCTIONS = `You are an experienced iExcel project manager reviewing a call transcript. Your job is to identify ALL action items discussed during the call and produce structured draft tasks for each one.

## EXTRACTION SCOPE

Extract any item that represents future work, a commitment, or a deliverable. This includes:

- Tasks explicitly assigned to a named person (e.g., "Mark will handle the SEO audit")
- Tasks a speaker assigns to themselves (e.g., "I will create a PRD", "my next step is to draft the proposal")
- Tasks discussed as upcoming work even without a specific assignee (e.g., "we need to set up the staging environment")
- Decisions that imply follow-up work (e.g., "let's go with option B" implies someone needs to implement option B)
- Commitments or promises made during the call (e.g., "I'll send that over by Friday")

Do NOT extract:
- Purely informational statements or status updates with no implied future action
- Items explicitly marked as already completed
- Casual remarks or hypotheticals that are not commitments (e.g., "it would be nice to someday...")
- You must ONLY reference or infer information about the client identified in the provided context. Do not reference or infer information about any other client.

## TASK DESCRIPTION FORMAT

Every task description MUST follow this exact three-section structure:

### TASK CONTEXT
Conversational prose explaining the reason for the task. Include direct quotes from the transcript (with the call date) where relevant. Write as if the reader has no access to the transcript and needs full context.

### ADDITIONAL CONTEXT
Any related, external, or historical factors that affect the task. If minimal context applies, still provide a brief note \u2014 this section must never be empty.

### REQUIREMENTS
Specific tools, steps, and acceptance criteria needed to execute the task. Must be actionable and specific. Provide these as an array of strings, where each string is a distinct requirement or acceptance criterion.

## TITLE FORMAT

- Task titles must be concise, actionable verb phrases.
- Good: "Update client proposal template with Q2 pricing"
- Bad: "Proposal" or "Task about the proposal update"
- Maximum 255 characters.

## ASSIGNEE EXTRACTION

- Extract the assignee from the transcript where explicitly named (e.g., "Mark, you'll handle the SEO audit" -> assignee: "Mark").
- If the transcript refers to a person ambiguously (e.g., "someone on the team"), set assignee to null.
- Never invent or guess assignees. When in doubt, set to null.

## ESTIMATED TIME

- Provide an estimate in ISO 8601 duration format (e.g., PT1H30M for 1 hour 30 minutes, PT2H for 2 hours, PT45M for 45 minutes).
- If the transcript states a time estimate, use that estimate.
- If no estimate is mentioned, apply industry-standard estimates based on the nature of the task.
- Always provide an estimate \u2014 never omit this field.

## SCRUM STAGE

- Always set scrumStage to "Backlog" for all tasks.

## OUTPUT FORMAT

Return a JSON object with:
- "tasks": An array of task objects. Each task object must have:
  - "title": string (concise, actionable verb phrase, max 255 chars)
  - "description": object with { "taskContext": string, "additionalContext": string, "requirements": string[] }
  - "assignee": string or null
  - "estimatedTime": string in ISO 8601 duration format (e.g., "PT2H30M") or null
  - "scrumStage": "Backlog" (always)
  - "tags": string[] (relevant category tags, can be empty array)
- "explanation": string (optional \u2014 include when the tasks array is empty to explain why no action items were found)

If no action items are found in the transcript, return an empty tasks array with an explanation field:
{ "tasks": [], "explanation": "No action items, commitments, or future work items were identified in this transcript." }

Do not return prose, markdown, or commentary outside the JSON structure.`;

"use strict";
const taskSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  clientId: z.string(),
  transcriptId: z.string().nullable(),
  status: z.enum(["draft", "approved", "rejected", "pushed", "completed"]),
  title: z.string(),
  description: z.object({
    taskContext: z.string(),
    additionalContext: z.string(),
    requirements: z.array(z.string())
  }),
  assignee: z.string().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  estimatedTime: z.string().nullable(),
  dueDate: z.string().nullable(),
  scrumStage: z.string(),
  tags: z.array(z.string()),
  externalRef: z.object({
    system: z.string(),
    externalId: z.string().nullable(),
    externalUrl: z.string().nullable(),
    projectId: z.string().nullable(),
    workspaceId: z.string().nullable()
  }).nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  pushedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
const saveTasksInputSchema = z.object({
  clientId: z.string().uuid(),
  transcriptId: z.string().uuid(),
  title: z.string(),
  description: z.object({
    taskContext: z.string(),
    additionalContext: z.string(),
    requirements: z.array(z.string())
  }),
  assignee: z.string().nullable(),
  estimatedTime: z.string().nullable(),
  scrumStage: z.string().default("Backlog"),
  tags: z.array(z.string()).default([]),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium")
});
const saveTasksOutputSchema = z.object({
  shortId: z.string(),
  id: z.string(),
  status: z.literal("draft")
});
const saveTasksTool = createTool({
  id: "save-tasks",
  description: "Save a single draft task for a client via the API. Call this once per task extracted from the transcript.",
  inputSchema: saveTasksInputSchema,
  outputSchema: saveTasksOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const result = await apiClient.createTasks(input.clientId, {
      clientId: input.clientId,
      transcriptId: input.transcriptId,
      title: input.title,
      description: input.description,
      assignee: input.assignee ?? void 0,
      estimatedTime: input.estimatedTime ?? void 0,
      scrumStage: input.scrumStage,
      tags: input.tags,
      priority: input.priority
    });
    const task = Array.isArray(result) ? result[0] : result;
    return {
      shortId: task.shortId,
      id: task.id,
      status: "draft"
    };
  }
});
const createDraftTasksInputSchema = z.object({
  clientId: z.string().describe("Client UUID to associate tasks with"),
  transcriptId: z.string().optional().describe("Source transcript UUID, if any"),
  tasks: z.array(
    z.object({
      title: z.string().describe("Task title"),
      description: z.object({
        taskContext: z.string(),
        additionalContext: z.string(),
        requirements: z.array(z.string())
      }),
      assignee: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      estimatedTime: z.string().optional().describe("ISO 8601 duration"),
      dueDate: z.string().optional().describe("ISO 8601 date"),
      scrumStage: z.string().optional(),
      tags: z.array(z.string()).optional()
    })
  )
});
const createDraftTasksOutputSchema = z.object({
  created: z.array(taskSchema)
});
const createDraftTasks = createTool({
  id: "create-draft-tasks",
  description: "Creates one or more draft tasks for a client, typically from an intake transcript.",
  inputSchema: createDraftTasksInputSchema,
  outputSchema: createDraftTasksOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const requests = input.tasks.map((task) => ({
      clientId: input.clientId,
      transcriptId: input.transcriptId,
      title: task.title,
      description: task.description,
      assignee: task.assignee,
      priority: task.priority,
      estimatedTime: task.estimatedTime,
      dueDate: task.dueDate,
      scrumStage: task.scrumStage,
      tags: task.tags
    }));
    const created = await apiClient.createTasks(input.clientId, requests);
    return { created };
  }
});
const getTaskInputSchema = z.object({
  taskId: z.string().describe("Task UUID or short ID (e.g., TSK-001)")
});
const getTaskOutputSchema = z.object({
  task: taskSchema
});
const getTask = createTool({
  id: "get-task",
  description: "Retrieves a single task by its ID.",
  inputSchema: getTaskInputSchema,
  outputSchema: getTaskOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const response = await apiClient.getTask(input.taskId);
    return { task: response.task };
  }
});
const listTasksForClientInputSchema = z.object({
  clientId: z.string().describe("Client UUID to list tasks for"),
  status: z.enum(["draft", "approved", "rejected", "pushed", "completed"]).optional().describe("Filter by task status"),
  limit: z.number().int().positive().max(100).default(20).describe("Maximum number of tasks to return")
});
const listTasksForClientOutputSchema = z.object({
  tasks: z.array(taskSchema),
  total: z.number().int()
});
const listTasksForClient = createTool({
  id: "list-tasks-for-client",
  description: "Lists tasks for a specific client, with optional status filter.",
  inputSchema: listTasksForClientInputSchema,
  outputSchema: listTasksForClientOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const response = await apiClient.listTasks(input.clientId, {
      status: input.status,
      limit: input.limit
    });
    return { tasks: response.data, total: response.total };
  }
});
const reconciledTaskSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  title: z.string(),
  description: z.object({
    taskContext: z.string(),
    additionalContext: z.string(),
    requirements: z.union([z.array(z.string()), z.string()])
  }),
  assignee: z.string().nullable(),
  estimatedTime: z.string().nullable(),
  scrumStage: z.string(),
  asanaStatus: z.enum(["completed", "incomplete", "not_found"]),
  asanaCompleted: z.boolean().nullable(),
  asanaCompletedAt: z.string().nullable()
});
const getReconciledTasksInputSchema = z.object({
  clientId: z.string().uuid().describe("Client UUID"),
  cycleStart: z.string().describe("ISO 8601 date for cycle start"),
  cycleEnd: z.string().describe("ISO 8601 date for cycle end")
});
const getReconciledTasksOutputSchema = z.object({
  tasks: z.array(reconciledTaskSchema)
});
const getReconciledTasksTool = createTool({
  id: "get-reconciled-tasks",
  description: "Retrieve reconciled tasks for a client within a cycle date range. Returns tasks with cached Asana completion status from the Postgres database.",
  inputSchema: getReconciledTasksInputSchema,
  outputSchema: getReconciledTasksOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const allTasks = [];
    let page = 1;
    const limit = 100;
    let hasMore = true;
    while (hasMore) {
      const response = await apiClient.listTasks(input.clientId, {
        status: "pushed",
        page,
        limit
      });
      for (const task of response.data) {
        allTasks.push({
          id: task.id,
          shortId: task.shortId,
          title: task.title,
          description: task.description,
          assignee: task.assignee,
          estimatedTime: task.estimatedTime,
          scrumStage: task.scrumStage,
          // Reconciled fields from Postgres cache (Feature 13)
          // These are served as part of the task response after reconciliation
          asanaStatus: task.asanaStatus ?? "not_found",
          asanaCompleted: task.asanaCompleted ?? null,
          asanaCompletedAt: task.asanaCompletedAt ?? null
        });
      }
      hasMore = response.hasMore;
      page++;
    }
    return { tasks: allTasks };
  }
});

"use strict";
const transcriptSegmentSchema = z.object({
  speaker: z.string(),
  timestamp: z.number(),
  text: z.string()
});
const transcriptSchema = z.object({
  id: z.string(),
  source: z.enum(["grain", "manual"]),
  sourceId: z.string(),
  meetingDate: z.string(),
  clientId: z.string(),
  meetingType: z.enum(["client_call", "intake", "follow_up"]),
  participants: z.array(z.string()),
  durationSeconds: z.number(),
  segments: z.array(transcriptSegmentSchema),
  summary: z.string().nullable(),
  highlights: z.array(z.string()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
const getTranscriptInputSchema = z.object({
  transcriptId: z.string().describe("Transcript UUID")
});
const getTranscriptOutputSchema = z.object({
  transcript: transcriptSchema
});
const getTranscript = createTool({
  id: "get-transcript",
  description: "Retrieves a single transcript by its ID.",
  inputSchema: getTranscriptInputSchema,
  outputSchema: getTranscriptOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const response = await apiClient.getTranscript(input.transcriptId);
    return { transcript: response };
  }
});
const listTranscriptsForClientInputSchema = z.object({
  clientId: z.string().describe("Client UUID to list transcripts for"),
  meetingType: z.enum(["client_call", "intake", "follow_up"]).optional().describe("Filter by meeting type"),
  limit: z.number().int().positive().max(100).default(20).describe("Maximum number of transcripts to return")
});
const listTranscriptsForClientOutputSchema = z.object({
  transcripts: z.array(transcriptSchema),
  total: z.number().int()
});
const listTranscriptsForClient = createTool({
  id: "list-transcripts-for-client",
  description: "Lists transcripts for a specific client, with optional meeting type filter.",
  inputSchema: listTranscriptsForClientInputSchema,
  outputSchema: listTranscriptsForClientOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const response = await apiClient.listTranscripts(input.clientId, {
      limit: input.limit
    });
    return {
      transcripts: response.data,
      total: response.total
    };
  }
});

"use strict";
const updateWorkflowStatusInputSchema = z.object({
  workflowRunId: z.string().uuid().describe("UUID of the workflow run record"),
  status: z.enum(["running", "completed", "failed"]).describe("New status for the workflow run"),
  result: z.record(z.unknown()).nullable().optional().describe("Result payload for completed workflows (shape varies by workflow type)"),
  error: z.object({
    code: z.string(),
    message: z.string()
  }).nullable().optional().describe("Error payload for failed workflows")
});
const updateWorkflowStatusOutputSchema = z.object({
  updated: z.boolean()
});
const updateWorkflowStatusTool = createTool({
  id: "update-workflow-status",
  description: "Updates the status of a workflow run. Used to report progress, completion, or failure.",
  inputSchema: updateWorkflowStatusInputSchema,
  outputSchema: updateWorkflowStatusOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    await apiClient.updateWorkflowStatus(input.workflowRunId, {
      status: input.status,
      result: input.result,
      error: input.error
    });
    return { updated: true };
  }
});

"use strict";
const saveDraftAgendaInputSchema = z.object({
  clientId: z.string().uuid().describe("Client UUID to associate the agenda with"),
  content: z.string().min(1).describe("Markdown content for the Running Notes document"),
  cycleStart: z.string().describe("ISO 8601 date for the cycle start"),
  cycleEnd: z.string().describe("ISO 8601 date for the cycle end")
});
const saveDraftAgendaOutputSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  status: z.literal("draft")
});
const saveDraftAgendaTool = createTool({
  id: "save-draft-agenda",
  description: "Save the generated Running Notes document as a draft agenda for a client.",
  inputSchema: saveDraftAgendaInputSchema,
  outputSchema: saveDraftAgendaOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const response = await apiClient.createAgenda(input.clientId, {
      clientId: input.clientId,
      content: input.content,
      cycleStart: input.cycleStart,
      cycleEnd: input.cycleEnd
    });
    return {
      id: response.id,
      shortId: response.shortId,
      status: "draft"
    };
  }
});
const getAgendaInputSchema = z.object({
  agendaId: z.string().describe("Agenda UUID or short ID (e.g., AGD-001)")
});
const getAgendaOutputSchema = z.object({
  agenda: z.object({
    id: z.string(),
    shortId: z.string(),
    clientId: z.string(),
    status: z.enum(["draft", "in_review", "finalized", "shared"]),
    content: z.string(),
    cycleStart: z.string(),
    cycleEnd: z.string(),
    sharedUrlToken: z.string().nullable(),
    internalUrlToken: z.string().nullable(),
    googleDocId: z.string().nullable(),
    finalizedBy: z.string().nullable(),
    finalizedAt: z.string().nullable(),
    sharedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string()
  })
});
const getAgenda = createTool({
  id: "get-agenda",
  description: "Retrieves a single agenda document by its ID.",
  inputSchema: getAgendaInputSchema,
  outputSchema: getAgendaOutputSchema,
  execute: async (input) => {
    const apiClient = getApiClient();
    const response = await apiClient.getAgenda(input.agendaId);
    return { agenda: response.agenda };
  }
});

"use strict";

"use strict";
function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  if (h === 0 && m === 0) {
    return "0m";
  }
  if (h === 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}
function formatDate(isoDate) {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });
}
function convertEstimatedTimeToDuration(input) {
  if (input === null || input === void 0) {
    return null;
  }
  const match = input.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!match) {
    return input;
  }
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  if (hours === 0 && minutes === 0) {
    return "PT0M";
  }
  const parts = ["PT"];
  if (hours > 0) {
    parts.push(`${hours}H`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}M`);
  }
  return parts.join("");
}
function buildIntakePrompt(transcript) {
  const segments = transcript.segments.map((s) => `[${formatTimestamp(s.timestamp)}] ${s.speaker}: ${s.text}`).join("\n");
  return [
    `Meeting Date: ${formatDate(transcript.meetingDate)}`,
    `Participants: ${transcript.participants.join(", ")}`,
    `Duration: ${formatDuration(transcript.durationSeconds)}`,
    transcript.summary ? `Summary:
${transcript.summary}` : null,
    transcript.highlights?.length ? `Highlights:
${transcript.highlights.map((h) => `- ${h}`).join("\n")}` : null,
    `
Full Transcript:
${segments || "(No segmented transcript available \u2014 use summary above)"}`
  ].filter(Boolean).join("\n\n");
}

"use strict";
var TaskStatus = /* @__PURE__ */ ((TaskStatus2) => {
  TaskStatus2["Draft"] = "draft";
  TaskStatus2["Approved"] = "approved";
  TaskStatus2["Rejected"] = "rejected";
  TaskStatus2["Pushed"] = "pushed";
  TaskStatus2["Completed"] = "completed";
  return TaskStatus2;
})(TaskStatus || {});
var TaskSource = /* @__PURE__ */ ((TaskSource2) => {
  TaskSource2["Agent"] = "agent";
  TaskSource2["UI"] = "ui";
  TaskSource2["Terminal"] = "terminal";
  return TaskSource2;
})(TaskSource || {});
var TaskPriority = /* @__PURE__ */ ((TaskPriority2) => {
  TaskPriority2["Low"] = "low";
  TaskPriority2["Medium"] = "medium";
  TaskPriority2["High"] = "high";
  TaskPriority2["Critical"] = "critical";
  return TaskPriority2;
})(TaskPriority || {});

"use strict";
var AgendaStatus = /* @__PURE__ */ ((AgendaStatus2) => {
  AgendaStatus2["Draft"] = "draft";
  AgendaStatus2["InReview"] = "in_review";
  AgendaStatus2["Finalized"] = "finalized";
  AgendaStatus2["Shared"] = "shared";
  return AgendaStatus2;
})(AgendaStatus || {});

"use strict";

"use strict";
var UserRole = /* @__PURE__ */ ((UserRole2) => {
  UserRole2["Admin"] = "admin";
  UserRole2["AccountManager"] = "account_manager";
  UserRole2["TeamMember"] = "team_member";
  return UserRole2;
})(UserRole || {});

"use strict";
var MeetingType = /* @__PURE__ */ ((MeetingType2) => {
  MeetingType2["ClientCall"] = "client_call";
  MeetingType2["Intake"] = "intake";
  MeetingType2["FollowUp"] = "follow_up";
  return MeetingType2;
})(MeetingType || {});

"use strict";
var ApiErrorCode = /* @__PURE__ */ ((ApiErrorCode2) => {
  ApiErrorCode2["Unauthorized"] = "UNAUTHORIZED";
  ApiErrorCode2["Forbidden"] = "FORBIDDEN";
  ApiErrorCode2["ClientNotFound"] = "CLIENT_NOT_FOUND";
  ApiErrorCode2["TaskNotFound"] = "TASK_NOT_FOUND";
  ApiErrorCode2["AgendaNotFound"] = "AGENDA_NOT_FOUND";
  ApiErrorCode2["TranscriptNotFound"] = "TRANSCRIPT_NOT_FOUND";
  ApiErrorCode2["TaskNotApprovable"] = "TASK_NOT_APPROVABLE";
  ApiErrorCode2["AgendaNotFinalizable"] = "AGENDA_NOT_FINALIZABLE";
  ApiErrorCode2["PushFailed"] = "PUSH_FAILED";
  ApiErrorCode2["WorkspaceNotConfigured"] = "WORKSPACE_NOT_CONFIGURED";
  ApiErrorCode2["ValidationError"] = "VALIDATION_ERROR";
  ApiErrorCode2["InternalError"] = "INTERNAL_ERROR";
  ApiErrorCode2["InvalidId"] = "INVALID_ID";
  ApiErrorCode2["InvalidBody"] = "INVALID_BODY";
  ApiErrorCode2["InvalidPagination"] = "INVALID_PAGINATION";
  ApiErrorCode2["GrainRecordingNotFound"] = "GRAIN_RECORDING_NOT_FOUND";
  ApiErrorCode2["GrainAccessDenied"] = "GRAIN_ACCESS_DENIED";
  ApiErrorCode2["GrainTranscriptUnavailable"] = "GRAIN_TRANSCRIPT_UNAVAILABLE";
  ApiErrorCode2["GrainApiError"] = "GRAIN_API_ERROR";
  ApiErrorCode2["ImportRecordReadOnly"] = "IMPORT_RECORD_READ_ONLY";
  ApiErrorCode2["ImportInProgress"] = "IMPORT_IN_PROGRESS";
  ApiErrorCode2["ImportJobNotFound"] = "IMPORT_JOB_NOT_FOUND";
  ApiErrorCode2["IntegrationNotFound"] = "INTEGRATION_NOT_FOUND";
  ApiErrorCode2["IntegrationAlreadyExists"] = "INTEGRATION_ALREADY_EXISTS";
  ApiErrorCode2["IntegrationCredentialInvalid"] = "INTEGRATION_CREDENTIAL_INVALID";
  ApiErrorCode2["IntegrationPlatformError"] = "INTEGRATION_PLATFORM_ERROR";
  ApiErrorCode2["WebhookVerificationFailed"] = "WEBHOOK_VERIFICATION_FAILED";
  return ApiErrorCode2;
})(ApiErrorCode || {});

"use strict";

"use strict";

"use strict";

"use strict";
const intakeOutputSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().min(1).max(255),
      description: z.object({
        taskContext: z.string().min(1),
        additionalContext: z.string().min(1),
        requirements: z.array(z.string().min(1)).min(1)
      }),
      assignee: z.string().nullable(),
      estimatedTime: z.string().regex(/^PT(\d+H)?(\d+M)?$/).nullable(),
      scrumStage: z.literal("Backlog"),
      tags: z.array(z.string()).default([])
    })
  ),
  explanation: z.string().optional()
});
const intakeAgent = new Agent({
  id: "intake-agent",
  name: "Intake Agent",
  description: "Processes client call transcripts and generates structured draft tasks.",
  instructions: INTAKE_AGENT_INSTRUCTIONS,
  model: {
    id: `${env.LLM_PROVIDER}/${env.LLM_MODEL}`
  },
  tools: {
    saveTasksTool,
    getTranscript,
    listTranscriptsForClient,
    createDraftTasks,
    getTask,
    listTasksForClient,
    updateWorkflowStatusTool
  }
});
const intakeGeneratorAgent = new Agent({
  id: "intake-generator",
  name: "Intake Generator",
  description: "Extracts structured tasks from transcripts.",
  instructions: INTAKE_AGENT_INSTRUCTIONS,
  model: {
    id: `${env.LLM_PROVIDER}/${env.LLM_MODEL}`
  }
});
async function updateWorkflowStatus(workflowRunId, status, result, error, logger) {
  try {
    const apiClient = getApiClient();
    await apiClient.updateWorkflowStatus(workflowRunId, {
      status,
      result,
      error
    });
  } catch (updateErr) {
    logger?.error("Failed to update workflow status", {
      workflowRunId,
      errorMessage: updateErr instanceof Error ? updateErr.message : String(updateErr)
    });
  }
}
const MAX_LLM_RETRIES = 3;
async function runIntakeAgent(input, logger = console) {
  const startTime = Date.now();
  const { workflowRunId, clientId, transcriptId } = input;
  logger.info("Intake agent invoked", {
    workflowRunId,
    clientId,
    transcriptId
  });
  const apiClient = getApiClient();
  let transcriptResponse;
  try {
    transcriptResponse = await apiClient.getTranscript(transcriptId);
  } catch (err) {
    const durationMs2 = Date.now() - startTime;
    logger.error("Failed to retrieve transcript", {
      workflowRunId,
      errorCode: "TRANSCRIPT_RETRIEVAL_FAILED",
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: durationMs2
    });
    await updateWorkflowStatus(
      workflowRunId,
      "failed",
      null,
      {
        code: "TRANSCRIPT_RETRIEVAL_FAILED",
        message: `Failed to retrieve transcript: ${err instanceof Error ? err.message : String(err)}`
      },
      logger
    );
    return;
  }
  const rawResponse = transcriptResponse;
  const normalizedSegments = rawResponse.normalized_segments ?? rawResponse.normalizedSegments ?? {};
  const transcript = {
    source: normalizedSegments.source ?? "manual",
    sourceId: normalizedSegments.sourceId ?? "",
    meetingDate: normalizedSegments.meetingDate ?? rawResponse.call_date ?? rawResponse.callDate ?? "",
    clientId: normalizedSegments.clientId || rawResponse.client_id || rawResponse.clientId || "",
    meetingType: normalizedSegments.meetingType ?? rawResponse.call_type ?? rawResponse.callType ?? "intake",
    participants: normalizedSegments.participants ?? [],
    durationSeconds: normalizedSegments.durationSeconds ?? 0,
    segments: normalizedSegments.segments ?? [],
    summary: normalizedSegments.summary ?? null,
    highlights: normalizedSegments.highlights ?? null
  };
  logger.debug("Transcript retrieved", {
    workflowRunId,
    transcriptId,
    segmentCount: transcript.segments?.length ?? 0,
    durationSeconds: transcript.durationSeconds
  });
  if (transcript.clientId !== clientId) {
    const durationMs2 = Date.now() - startTime;
    logger.error("Client ID mismatch", {
      workflowRunId,
      errorCode: "CLIENT_MISMATCH",
      errorMessage: `Transcript clientId "${transcript.clientId}" does not match invocation clientId "${clientId}"`,
      durationMs: durationMs2
    });
    await updateWorkflowStatus(
      workflowRunId,
      "failed",
      null,
      {
        code: "CLIENT_MISMATCH",
        message: "Transcript clientId does not match invocation clientId"
      },
      logger
    );
    return;
  }
  if (transcript.meetingType !== MeetingType.Intake) {
    logger.warn('Transcript meeting type is not "intake"', {
      workflowRunId,
      meetingType: transcript.meetingType
    });
  }
  const hasSegments = transcript.segments && transcript.segments.length > 0;
  const hasSummary = transcript.summary !== null && transcript.summary !== void 0;
  if (!hasSegments && !hasSummary) {
    const durationMs2 = Date.now() - startTime;
    logger.error("Empty transcript \u2014 no segments and no summary", {
      workflowRunId,
      errorCode: "EMPTY_TRANSCRIPT",
      errorMessage: "Transcript has no segments and no summary",
      durationMs: durationMs2
    });
    await updateWorkflowStatus(
      workflowRunId,
      "failed",
      null,
      {
        code: "EMPTY_TRANSCRIPT",
        message: "Transcript has no processable content (no segments and no summary)"
      },
      logger
    );
    return;
  }
  await updateWorkflowStatus(workflowRunId, "running", null, null, logger);
  const userPrompt = buildIntakePrompt(transcript);
  let llmOutput = null;
  for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
    logger.debug("LLM call", { workflowRunId, attempt });
    try {
      const result = await intakeGeneratorAgent.generate(
        attempt === 1 ? userPrompt : `${userPrompt}

IMPORTANT: Your previous response did not conform to the required JSON schema. Please return only the JSON object as specified.`,
        { structuredOutput: { schema: intakeOutputSchema } }
      );
      const parsed = result.object;
      if (parsed) {
        llmOutput = parsed;
        logger.debug("LLM output received", {
          workflowRunId,
          tasksExtracted: llmOutput.tasks.length,
          attempt
        });
        break;
      }
      throw new Error("LLM returned no structured output");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn("LLM retry triggered", {
        workflowRunId,
        attempt,
        validationError: errorMessage.substring(0, 500)
      });
      if (attempt === MAX_LLM_RETRIES) {
        const durationMs2 = Date.now() - startTime;
        logger.error("LLM output invalid after all retries", {
          workflowRunId,
          errorCode: "LLM_OUTPUT_INVALID",
          errorMessage: `All ${MAX_LLM_RETRIES} LLM attempts failed schema validation`,
          durationMs: durationMs2
        });
        await updateWorkflowStatus(
          workflowRunId,
          "failed",
          null,
          {
            code: "LLM_OUTPUT_INVALID",
            message: `LLM output failed schema validation after ${MAX_LLM_RETRIES} attempts`
          },
          logger
        );
        return;
      }
    }
  }
  if (!llmOutput) {
    return;
  }
  if (llmOutput.tasks.length === 0) {
    logger.info("No action items found in transcript", {
      workflowRunId,
      explanation: llmOutput.explanation
    });
    await updateWorkflowStatus(
      workflowRunId,
      "completed",
      {
        task_short_ids: [],
        tasks_attempted: 0,
        tasks_created: 0,
        tasks_failed: 0,
        explanation: llmOutput.explanation || "No action items found"
      },
      null,
      logger
    );
    const durationMs2 = Date.now() - startTime;
    logger.info("Intake agent completed", {
      workflowRunId,
      tasksCreated: 0,
      tasksFailed: 0,
      durationMs: durationMs2
    });
    return;
  }
  logger.debug("Task creation started", {
    workflowRunId,
    taskCount: llmOutput.tasks.length
  });
  let tasksAttempted = llmOutput.tasks.length;
  let tasksCreated = 0;
  let tasksFailed = 0;
  const taskShortIds = [];
  function durationToHHMM(iso) {
    if (!iso) return void 0;
    const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
    if (!match) return void 0;
    const h = String(match[1] || "0").padStart(2, "0");
    const m = String(match[2] || "0").padStart(2, "0");
    return `${h}:${m}`;
  }
  const batchBody = {
    transcript_id: transcriptId,
    source: "agent",
    tasks: llmOutput.tasks.map((task) => ({
      title: task.title,
      description: task.description,
      assignee: task.assignee ?? void 0,
      estimated_time: durationToHHMM(task.estimatedTime),
      scrum_stage: task.scrumStage
    }))
  };
  try {
    const results = await apiClient.createTasks(clientId, batchBody);
    const rawData = results?.data ?? results;
    const savedTasks = Array.isArray(rawData) ? rawData : [rawData];
    tasksCreated = savedTasks.length;
    for (const saved of savedTasks) {
      const shortId = saved.shortId ?? saved.short_id;
      if (shortId) taskShortIds.push(shortId);
    }
    logger.debug("Tasks saved", {
      workflowRunId,
      tasksCreated
    });
  } catch (err) {
    tasksFailed = tasksAttempted;
    logger.warn("Batch task creation failed", {
      workflowRunId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
  const durationMs = Date.now() - startTime;
  if (tasksCreated === 0 && llmOutput.tasks.length > 0) {
    logger.error("All task creation requests failed", {
      workflowRunId,
      errorCode: "TASK_CREATION_FAILED",
      errorMessage: "All task creation requests failed",
      durationMs
    });
    await updateWorkflowStatus(
      workflowRunId,
      "failed",
      null,
      {
        code: "TASK_CREATION_FAILED",
        message: "All task creation requests failed. Check API and database connectivity."
      },
      logger
    );
  } else {
    logger.info("Intake agent completed", {
      workflowRunId,
      tasksCreated,
      tasksFailed,
      durationMs
    });
    await updateWorkflowStatus(
      workflowRunId,
      "completed",
      {
        task_short_ids: taskShortIds,
        tasks_attempted: tasksAttempted,
        tasks_created: tasksCreated,
        tasks_failed: tasksFailed
      },
      null,
      logger
    );
  }
}

"use strict";
const AGENDA_AGENT_INSTRUCTIONS = `You are an experienced iExcel project manager preparing a client-facing Running Notes document ahead of a follow-up call.

## Purpose

The Running Notes document is a client-facing status update that communicates what has been accomplished during the billing cycle, what remains outstanding, and what the agenda is for the upcoming call. The tone must be professional and conversational \u2014 not a data dump of raw task titles. Write as if you are addressing the client directly in a status meeting.

## Input Data

You will receive two data sets:

1. **completedTasks** \u2014 an array of tasks where the Asana status is "completed". Each task includes a short ID, title, assignee, estimated time, and a brief context description.
2. **incompleteTasks** \u2014 an array of tasks where the Asana status is "incomplete" or "not_found". Same fields as completedTasks.

## Output Format

Return a single JSON object with a \`content\` field containing the full Running Notes document as a **markdown string**. The markdown must contain all six sections described below, each as an H2 heading (\`## Section Name\`).

Do NOT return plain text without structure. Do NOT omit any section.

## Required Sections

### 1. ## Completed Tasks
Group completed tasks by theme or project. For each theme group, write 2-4 sentences of human-readable prose summarizing what was accomplished. Do NOT list individual task titles as bullet points \u2014 instead, synthesize them into a coherent narrative about the work completed in that theme area. Identify themes from task titles, descriptions, and context.

### 2. ## Incomplete Tasks
List tasks that are still in progress or were not started during this cycle. Group by theme where applicable. For each task or group, provide brief context on what they represent and, if inferable from the context, why they may still be pending. Tasks with a "not_found" Asana status should be noted as items whose external status could not be verified.

### 3. ## Relevant Deliverables
Identify tangible outputs, artifacts, or deliverables that resulted from the completed work. Bridge the completed tasks to their real-world outputs (e.g., "The Q2 campaign brief is now complete and ready for client review"). If no specific deliverables are identifiable, note the key outcomes.

### 4. ## Recommendations
Based on the completed work, patterns observed, and what remains incomplete, offer 2-4 specific, actionable recommendations for the client or for the upcoming cycle. Each recommendation should be grounded in the actual task data, not generic advice.

### 5. ## New Ideas
Identify 1-3 ideas or opportunities that emerged from the work this cycle. These should be forward-looking, creative, and grounded in the task context \u2014 not generic suggestions.

### 6. ## Next Steps
Define 3-5 clear next-step action items for the upcoming cycle. These can be continuations of incomplete work, follow-up actions from completed work, or new items suggested by the work context. Each step should be specific and actionable.

## No-Completed-Tasks Guard

If the completedTasks array is empty (zero completed tasks), do NOT generate a Running Notes document. Instead, return a JSON object with:
\`\`\`json
{ "error": "NO_COMPLETED_TASKS", "message": "No completed tasks were found. Cannot generate agenda." }
\`\`\`

## Data Scoping

You must ONLY reference information from the provided task data for the specified client. Do NOT reference, infer, or fabricate information about any other client, project, or data source not present in the input. All content must be grounded in the provided task arrays.

## Content Guidelines

- Write in a professional, conversational tone suitable for a client meeting.
- Do not include internal system identifiers like UUIDs or TSK-NNNN short IDs in the output \u2014 those are for internal tracking, not client display.
- The document should read as if prepared by a knowledgeable project manager who understands the client relationship.
- Keep each section concise but substantive.
`;

"use strict";
const agendaAgent = new Agent({
  id: "agenda-agent",
  name: "Agenda Agent",
  description: "Compiles reconciled tasks into a structured Running Notes agenda for client review.",
  instructions: AGENDA_AGENT_INSTRUCTIONS,
  model: {
    id: `${env.LLM_PROVIDER}/${env.LLM_MODEL}`
  },
  tools: {
    getReconciledTasksTool,
    saveDraftAgendaTool,
    updateWorkflowStatusTool
  }
});

"use strict";

"use strict";
function extractToken(context) {
  const authInfo = context.mcp?.extra?.authInfo;
  if (authInfo?.token) {
    return authInfo.token;
  }
  if (context.requestContext) {
    const token = context.requestContext.get("userToken");
    if (token) {
      return token;
    }
    const authHeader = context.requestContext.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }
  }
  return null;
}

"use strict";
function createUserApiClient(userToken) {
  return createApiClient({
    baseUrl: env.API_BASE_URL,
    tokenProvider: {
      getAccessToken: async () => userToken,
      refreshAccessToken: async () => userToken
    }
  });
}

"use strict";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class ClientNotFoundError extends Error {
  constructor(clientParam) {
    super(`No client named '${clientParam}' found. Use list_clients to see available clients.`);
    this.clientParam = clientParam;
    this.name = "ClientNotFoundError";
  }
}
class AmbiguousClientError extends Error {
  constructor(clientParam) {
    super(`Multiple clients match '${clientParam}'. Use list_clients to find the exact client name or ID.`);
    this.clientParam = clientParam;
    this.name = "AmbiguousClientError";
  }
}
async function resolveClient(apiClient, clientParam) {
  if (UUID_RE.test(clientParam)) {
    const client = await apiClient.getClient(clientParam);
    return { id: client.id, name: client.name };
  }
  const results = await apiClient.listClients({ limit: 10 });
  const matches = results.data.filter(
    (c) => c.name.toLowerCase() === clientParam.toLowerCase()
  );
  if (matches.length === 0) {
    const partialMatches = results.data.filter(
      (c) => c.name.toLowerCase().includes(clientParam.toLowerCase())
    );
    if (partialMatches.length === 1) {
      return { id: partialMatches[0].id, name: partialMatches[0].name };
    }
    if (partialMatches.length > 1) {
      throw new AmbiguousClientError(clientParam);
    }
    throw new ClientNotFoundError(clientParam);
  }
  if (matches.length > 1) {
    throw new AmbiguousClientError(clientParam);
  }
  return { id: matches[0].id, name: matches[0].name };
}

"use strict";
function handleApiError(error, toolContext) {
  if (error instanceof ClientNotFoundError) {
    return error.message;
  }
  if (error instanceof AmbiguousClientError) {
    return error.message;
  }
  if (error instanceof ApiClientError) {
    const resource = toolContext?.resource ?? "that resource";
    switch (error.statusCode) {
      case 401:
        return "Your session has expired. Re-authenticate and try again.";
      case 403:
        return `You don't have permission to access ${resource}. Contact your administrator.`;
      case 404:
        return `Resource not found.`;
      case 409: {
        const detail = error.details?.["message"];
        return detail ?? "The operation could not be completed due to a conflict. Check the current state and try again.";
      }
      default:
        break;
    }
    if (error.code === "NETWORK_ERROR") {
      return "Could not reach the iExcel API. Check your network connection and try again.";
    }
    if (error.statusCode >= 500) {
      return "An unexpected server error occurred. Try again shortly.";
    }
    return "An unexpected error occurred. Try again shortly.";
  }
  if (error instanceof TypeError && error.message?.includes("fetch")) {
    return "Could not reach the iExcel API. Check your network connection and try again.";
  }
  return "An unexpected error occurred. Try again shortly.";
}

"use strict";
const defaultLogger = {
  info(obj, msg) {
    console.log(JSON.stringify({ level: "info", ...obj, msg }));
  },
  warn(obj, msg) {
    console.warn(JSON.stringify({ level: "warn", ...obj, msg }));
  }
};
let _logger = defaultLogger;
function setToolLogger(logger) {
  _logger = logger;
}
async function logToolCall(options, fn) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const startMs = Date.now();
  try {
    const result = await fn();
    _logger.info({
      tool: options.tool,
      requestSource: "mcp",
      userId: options.userId,
      clientParam: options.clientParam,
      startedAt,
      durationMs: Date.now() - startMs,
      success: true
    });
    return result;
  } catch (err) {
    _logger.warn({
      tool: options.tool,
      requestSource: "mcp",
      userId: options.userId,
      clientParam: options.clientParam,
      startedAt,
      durationMs: Date.now() - startMs,
      success: false,
      error: err instanceof Error ? err.message : "Unknown error"
    });
    throw err;
  }
}

"use strict";
function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}
function formatTime(estimatedTime) {
  if (!estimatedTime) return "-";
  return estimatedTime;
}
function formatTaskTable(tasks) {
  const header = "| ID       | Description                                                  | Time   | Status   |";
  const divider = "|----------|--------------------------------------------------------------|--------|----------|";
  const rows = tasks.map((t) => {
    const desc = truncate(t.title, 60);
    const time = formatTime(t.estimatedTime);
    return `| ${t.shortId.padEnd(8)} | ${desc.padEnd(60)} | ${time.padEnd(6)} | ${t.status.padEnd(8)} |`;
  });
  return [header, divider, ...rows].join("\n");
}
function formatClientStatus(clientName, status) {
  const lines = [
    `Client: ${clientName}`,
    `Pending Approvals: ${status.pendingApprovals}`,
    `Agenda Ready: ${status.agendaReady ? "Yes" : "No"}`,
    `Next Call: ${status.nextCallDate ?? "Not scheduled"}`
  ];
  return lines.join("\n");
}
function formatClientList(clients) {
  const header = "| Client Name                      | ID                                   |";
  const divider = "|----------------------------------|--------------------------------------|";
  const rows = clients.map(
    (c) => `| ${truncate(c.name, 32).padEnd(32)} | ${c.id.padEnd(36)} |`
  );
  return [header, divider, ...rows].join("\n");
}
function formatAgenda(clientName, agenda) {
  const lines = [
    `Agenda ${agenda.shortId} for ${clientName}`,
    `Status: ${agenda.status}`,
    `Cycle: ${agenda.cycleStart} to ${agenda.cycleEnd}`,
    "",
    agenda.content
  ];
  return lines.join("\n");
}
function truncateTranscript(content, transcriptId, uiBaseUrl) {
  const MAX_LENGTH = 2e3;
  if (content.length <= MAX_LENGTH) return content;
  const truncated = content.slice(0, MAX_LENGTH);
  const url = uiBaseUrl ? `${uiBaseUrl}/transcripts/${transcriptId}` : `transcripts/${transcriptId}`;
  return `${truncated}

[Transcript truncated. View the full transcript at ${url}]`;
}
function formatError(message) {
  return message;
}

"use strict";
const listClientsTool = createTool({
  id: "list_clients",
  description: "List all clients the authenticated user has access to.",
  inputSchema: z.object({}),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  execute: async (_input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "list_clients", userId: "unknown" },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const result = await apiClient.listClients();
          if (result.data.length === 0) {
            return "No clients found for your account. Contact your administrator.";
          }
          return formatClientList(result.data);
        } catch (error) {
          return handleApiError(error, { toolId: "list_clients" });
        }
      }
    );
  }
});

"use strict";
const getClientStatusTool = createTool({
  id: "get_client_status",
  description: "Get an overview of a client's current workflow cycle -- pending approvals, agenda readiness, and upcoming call date.",
  inputSchema: z.object({
    client: z.string().min(1).describe('Client name (e.g., "Total Life") or client ID')
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "get_client_status", userId: "unknown", clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);
          const status = await apiClient.getClientStatus(client.id);
          return formatClientStatus(client.name, status);
        } catch (error) {
          return handleApiError(error, {
            toolId: "get_client_status",
            resource: "that client"
          });
        }
      }
    );
  }
});

"use strict";
const getAgendaTool = createTool({
  id: "get_agenda",
  description: "Retrieve the current agenda (Running Notes) for a named client.",
  inputSchema: z.object({
    client: z.string().min(1).describe('Client name (e.g., "Total Life") or client short ID')
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "get_agenda", userId: "unknown", clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);
          const agendas = await apiClient.listAgendas(client.id);
          if (agendas.data.length === 0) {
            return `No agenda found for ${client.name}. Run trigger_agenda to generate one.`;
          }
          const agenda = agendas.data[0];
          return formatAgenda(client.name, agenda);
        } catch (error) {
          return handleApiError(error, {
            toolId: "get_agenda",
            resource: "that client"
          });
        }
      }
    );
  }
});

"use strict";
const getTasksTool = createTool({
  id: "get_tasks",
  description: "List generated tasks for a client, optionally filtered by status. Returns short IDs.",
  inputSchema: z.object({
    client: z.string().min(1).describe("Client name or client ID"),
    status: z.enum(["draft", "approved", "rejected", "completed"]).optional().describe("Filter by task status. Omit to return all statuses.")
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "get_tasks", userId: "unknown", clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);
          const tasks = await apiClient.listTasks(client.id, {
            status: input.status
          });
          if (tasks.data.length === 0) {
            if (input.status) {
              return `No ${input.status} tasks found for ${client.name}.`;
            }
            return `No tasks found for ${client.name}.`;
          }
          return formatTaskTable(tasks.data);
        } catch (error) {
          return handleApiError(error, {
            toolId: "get_tasks",
            resource: "that client"
          });
        }
      }
    );
  }
});

"use strict";
const getTranscriptTool = createTool({
  id: "get_transcript",
  description: "Retrieve a Grain transcript for a client, optionally filtered by date.",
  inputSchema: z.object({
    client: z.string().min(1).describe("Client name or client ID"),
    date: z.string().optional().describe(
      "Date of the call (ISO 8601 or natural language). Returns the most recent transcript if omitted."
    )
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "get_transcript", userId: "unknown", clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);
          const transcripts = await apiClient.listTranscripts(client.id, {
            limit: 1
          });
          if (transcripts.data.length === 0) {
            if (input.date) {
              return `No transcript found for ${client.name} on ${input.date}.`;
            }
            return `No transcript found for ${client.name}.`;
          }
          const transcript = transcripts.data[0];
          const header = [
            `Transcript for ${client.name}`,
            `Date: ${transcript.callDate}`,
            `Type: ${transcript.callType}`,
            ""
          ].join("\n");
          const content = transcript.rawTranscript;
          return header + truncateTranscript(content, transcript.id);
        } catch (error) {
          return handleApiError(error, {
            toolId: "get_transcript",
            resource: "that client"
          });
        }
      }
    );
  }
});

"use strict";
const triggerIntakeTool = createTool({
  id: "trigger_intake",
  description: "Kick off Workflow A -- process a call transcript and generate draft tasks. Returns the workflow run ID.",
  inputSchema: z.object({
    client: z.string().min(1).describe("Client name or client ID"),
    date: z.string().optional().describe(
      'Date of the intake call (ISO 8601 or natural language: "today", "yesterday"). Used to identify the correct transcript.'
    ),
    transcript_source: z.string().optional().describe(
      "Grain URL or transcript text. If omitted, Mastra fetches the latest transcript for the client."
    )
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "trigger_intake", userId: "unknown", clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);
          const transcripts = await apiClient.listTranscripts(client.id, { limit: 1 });
          if (transcripts.data.length === 0) {
            const dateStr = input.date ? ` on ${input.date}` : "";
            return `No transcript found for ${client.name}${dateStr}. Verify the date or provide a transcript source.`;
          }
          const transcriptId = transcripts.data[0].id;
          const result = await apiClient.triggerIntakeWorkflow({
            clientId: client.id,
            transcriptId
          });
          return [
            `Intake workflow started for ${client.name}.`,
            `Workflow Run ID: ${result.id}`,
            `Use get_tasks(client="${client.name}", status="draft") to check for generated tasks once complete.`
          ].join("\n");
        } catch (error) {
          if (error instanceof ApiClientError) {
            if (error.statusCode === 404) {
              const dateStr = input.date ? ` on ${input.date}` : "";
              return `No transcript found for ${input.client}${dateStr}. Verify the date or provide a transcript source.`;
            }
            if (error.statusCode === 409) {
              return `A workflow is already running for ${input.client}. Check status with get_client_status.`;
            }
          }
          return handleApiError(error, {
            toolId: "trigger_intake",
            resource: "that client"
          });
        }
      }
    );
  }
});

"use strict";
const triggerAgendaTool = createTool({
  id: "trigger_agenda",
  description: "Kick off Workflow B -- compile completed tasks into a Running Notes agenda. Returns the workflow run ID.",
  inputSchema: z.object({
    client: z.string().min(1).describe("Client name or client ID"),
    cycle_start: z.string().optional().describe(
      "Start date of the work cycle (ISO 8601). Defaults to the last agenda date if omitted."
    ),
    cycle_end: z.string().optional().describe(
      "End date of the work cycle (ISO 8601). Defaults to today if omitted."
    )
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "trigger_agenda", userId: "unknown", clientParam: input.client },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const client = await resolveClient(apiClient, input.client);
          const cycleEnd = input.cycle_end ?? (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const cycleStart = input.cycle_start ?? cycleEnd;
          const result = await apiClient.triggerAgendaWorkflow({
            clientId: client.id,
            cycleStart,
            cycleEnd
          });
          return [
            `Agenda workflow started for ${client.name}.`,
            `Workflow Run ID: ${result.id}`,
            `Use get_agenda(client="${client.name}") to check the generated agenda once complete.`
          ].join("\n");
        } catch (error) {
          if (error instanceof ApiClientError) {
            if (error.statusCode === 404 || error.statusCode === 422) {
              return `No completed tasks found for ${input.client} in the specified cycle. Ensure tasks are marked completed before generating an agenda.`;
            }
            if (error.statusCode === 409) {
              return `A workflow is already running for ${input.client}. Check status with get_client_status.`;
            }
          }
          return handleApiError(error, {
            toolId: "trigger_agenda",
            resource: "that client"
          });
        }
      }
    );
  }
});

"use strict";
const TIME_RE = /^(\d+h\s*)?(\d+m)?$/;
const editTaskTool = createTool({
  id: "edit_task",
  description: "Edit a task by short ID (e.g., TSK-0042). Update description, assignee, estimated time, or workspace.",
  inputSchema: z.object({
    id: z.string().regex(/^TSK-\d{3,}$/, { message: "Use the format TSK-0042." }).describe("Short ID of the task (e.g., TSK-0043)"),
    description: z.string().optional().describe("New task description"),
    assignee: z.string().optional().describe("Assignee name or user ID"),
    estimated_time: z.string().optional().describe('New estimated time (e.g., "1h 00m", "0h 45m")'),
    workspace: z.string().optional().describe("Asana workspace name or ID")
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "edit_task", userId: "unknown" },
      async () => {
        const hasField = input.description || input.assignee || input.estimated_time || input.workspace;
        if (!hasField) {
          return "Please specify at least one field to update (description, assignee, estimated_time, workspace).";
        }
        if (input.estimated_time) {
          const trimmed = input.estimated_time.trim();
          if (!TIME_RE.test(trimmed) || trimmed.length === 0) {
            return "Invalid time format. Use format '1h 30m' or '0h 45m'.";
          }
        }
        try {
          const apiClient = createUserApiClient(userToken);
          const body = {};
          if (input.description) body["title"] = input.description;
          if (input.assignee) body["assignee"] = input.assignee;
          if (input.estimated_time) body["estimatedTime"] = input.estimated_time;
          await apiClient.updateTask(input.id, body);
          const updates = [`Task ${input.id} updated.`];
          if (input.estimated_time) updates.push(`Estimated time: ${input.estimated_time}`);
          if (input.assignee) updates.push(`Assignee: ${input.assignee}`);
          if (input.description) updates.push(`Description: updated`);
          if (input.workspace) updates.push(`Workspace: ${input.workspace}`);
          return updates.join("\n");
        } catch (error) {
          if (error instanceof ApiClientError) {
            if (error.statusCode === 404) {
              return `No task found with ID ${input.id}.`;
            }
            if (error.statusCode === 409) {
              const status = error.details?.["status"] ?? "non-draft";
              return `${input.id} cannot be edited -- it is in '${status}' status. Only draft tasks can be edited.`;
            }
          }
          return handleApiError(error, { toolId: "edit_task" });
        }
      }
    );
  }
});

"use strict";
const rejectTaskTool = createTool({
  id: "reject_task",
  description: "Reject a task by short ID. The task must be in draft status.",
  inputSchema: z.object({
    id: z.string().regex(/^TSK-\d{3,}$/, { message: "Use the format TSK-0042." }).describe("Short ID of the task (e.g., TSK-0044)"),
    reason: z.string().optional().describe("Optional rejection reason for the audit log")
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "reject_task", userId: "unknown" },
      async () => {
        try {
          const apiClient = createUserApiClient(userToken);
          const body = input.reason ? { reason: input.reason } : void 0;
          await apiClient.rejectTask(input.id, body);
          return `Task ${input.id} rejected.`;
        } catch (error) {
          if (error instanceof ApiClientError) {
            if (error.statusCode === 404) {
              return `No task found with ID ${input.id}.`;
            }
            if (error.statusCode === 409) {
              const status = error.details?.["status"] ?? "non-draft";
              return `${input.id} cannot be rejected -- it is in '${status}' status.`;
            }
          }
          return handleApiError(error, { toolId: "reject_task" });
        }
      }
    );
  }
});

"use strict";
const shortIdPattern = /^TSK-\d{3,}$/;
const approveTasksTool = createTool({
  id: "approve_tasks",
  description: "Approve one or more draft tasks by short ID. Supports individual and batch approval.",
  inputSchema: z.object({
    ids: z.union([
      z.string().regex(shortIdPattern),
      z.array(z.string().regex(shortIdPattern)).min(1)
    ]).describe(
      'Short ID or array of short IDs (e.g., "TSK-0042" or ["TSK-0042", "TSK-0043"])'
    )
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "approve_tasks", userId: "unknown" },
      async () => {
        const ids = Array.isArray(input.ids) ? input.ids : [input.ids];
        try {
          const apiClient = createUserApiClient(userToken);
          if (ids.length === 1) {
            try {
              await apiClient.approveTask(ids[0]);
              return `Task ${ids[0]} approved.`;
            } catch (error) {
              if (error instanceof ApiClientError) {
                if (error.statusCode === 404) {
                  return `No task found with ID ${ids[0]}.`;
                }
                if (error.statusCode === 409) {
                  const status = error.details?.["status"] ?? "non-draft";
                  return `${ids[0]} cannot be approved -- it is in '${status}' status.`;
                }
              }
              throw error;
            }
          }
          const firstTask = await apiClient.getTask(ids[0]);
          const clientId = firstTask.task.clientId;
          const result = await apiClient.batchApproveTasks(clientId, {
            taskIds: ids
          });
          const succeeded = result.succeeded;
          const failed = result.failed;
          if (succeeded.length === 0 && failed.length > 0) {
            return "None of the provided task IDs could be found. Check IDs with get_tasks.";
          }
          const parts = [];
          if (succeeded.length > 0) {
            parts.push(`${succeeded.length} tasks approved: ${succeeded.join(", ")}.`);
          }
          if (failed.length > 0) {
            const skipped = failed.map((f) => f.id).join(", ");
            parts.push(`${skipped} was not in draft status and was skipped.`);
          }
          return parts.join(" ");
        } catch (error) {
          if (error instanceof ApiClientError) {
            if (error.statusCode === 404) {
              return "None of the provided task IDs could be found. Check IDs with get_tasks.";
            }
          }
          return handleApiError(error, { toolId: "approve_tasks" });
        }
      }
    );
  }
});

"use strict";
async function apiCall$3(token, method, path, body) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${env.API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : void 0
  });
}
const ingestFromUrlTool = createTool({
  id: "ingest_from_url",
  description: "Ingest a transcript from a URL. Auto-detects platform (Fireflies, Grain) from the URL, fetches the transcript, and processes it through the pipeline.",
  inputSchema: z.object({
    url: z.string().url().describe("URL of the transcript (e.g., Fireflies or Grain recording URL)"),
    client_id: z.string().optional().describe("Client UUID to associate the transcript with"),
    meeting_type: z.enum(["client_call", "intake", "follow_up"]).optional().describe("Type of meeting")
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "ingest_from_url", userId: "unknown", clientParam: input.url },
      async () => {
        try {
          const response = await apiCall$3(userToken, "POST", "/transcripts/from-url", {
            url: input.url,
            clientId: input.client_id,
            meetingType: input.meeting_type
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errObj = errorData["error"];
            const message = errObj ? errObj["message"] ?? "Unknown error" : `API returned ${response.status}`;
            return formatError(message);
          }
          const data = await response.json();
          return [
            "Transcript ingested successfully.",
            `Transcript ID: ${data.transcriptId}`,
            `Version ID: ${data.versionId}`,
            `Detected format: ${data.format}`
          ].join("\n");
        } catch (error) {
          return handleApiError(error, {
            toolId: "ingest_from_url",
            resource: "transcript"
          });
        }
      }
    );
  }
});

"use strict";
async function apiCall$2(token, method, path, body) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${env.API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : void 0
  });
}
const ingestFromTextTool = createTool({
  id: "ingest_from_text",
  description: "Ingest a transcript from raw text. Auto-detects format (SRT, turn-based, raw), parses, and stores the transcript.",
  inputSchema: z.object({
    raw_text: z.string().min(1).describe("The raw transcript text to ingest"),
    client_id: z.string().optional().describe("Client UUID to associate the transcript with"),
    meeting_type: z.enum(["client_call", "intake", "follow_up"]).optional().describe("Type of meeting"),
    call_date: z.string().optional().describe("Date of the call (ISO 8601). Defaults to now if omitted.")
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "ingest_from_text", userId: "unknown", clientParam: input.client_id ?? "none" },
      async () => {
        try {
          const response = await apiCall$2(userToken, "POST", "/transcripts/parse", {
            rawText: input.raw_text,
            clientId: input.client_id,
            meetingType: input.meeting_type,
            callDate: input.call_date
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errObj = errorData["error"];
            const message = errObj ? errObj["message"] ?? "Unknown error" : `API returned ${response.status}`;
            return formatError(message);
          }
          const data = await response.json();
          return [
            "Transcript ingested successfully.",
            `Transcript ID: ${data.transcriptId}`,
            `Version ID: ${data.versionId}`,
            `Detected format: ${data.format}`
          ].join("\n");
        } catch (error) {
          return handleApiError(error, {
            toolId: "ingest_from_text",
            resource: "transcript"
          });
        }
      }
    );
  }
});

"use strict";
async function apiCall$1(token, method, path) {
  return fetch(`${env.API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
}
const listRecordingsTool = createTool({
  id: "list_recordings",
  description: "List available recordings from a connected meeting platform (Fireflies or Grain). Requires the platform to be connected via Integrations.",
  inputSchema: z.object({
    platform: z.enum(["fireflies", "grain"]).describe("Which connected platform to list recordings from")
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "list_recordings", userId: "unknown", clientParam: input.platform },
      async () => {
        try {
          const response = await apiCall$1(
            userToken,
            "GET",
            `/transcripts/available?platform=${input.platform}`
          );
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errObj = errorData["error"];
            const message = errObj ? errObj["message"] ?? "Unknown error" : `API returned ${response.status}`;
            return formatError(message);
          }
          const data = await response.json();
          if (data.recordings.length === 0) {
            return `No recordings found on ${input.platform}. Check that the platform is connected and has recordings.`;
          }
          const lines = [
            `Found ${data.recordings.length} recording(s) on ${input.platform}:`,
            ""
          ];
          for (const rec of data.recordings) {
            const duration = rec.durationSeconds ? `${Math.round(rec.durationSeconds / 60)}min` : "unknown duration";
            const participants = rec.participants.length > 0 ? rec.participants.join(", ") : "no participants listed";
            lines.push(`- **${rec.title}** (${rec.date}, ${duration})`);
            lines.push(`  Participants: ${participants}`);
            lines.push(`  ID: ${rec.id}`);
            lines.push("");
          }
          lines.push(
            "Use import_recordings to import selected recordings by their IDs."
          );
          return lines.join("\n");
        } catch (error) {
          return handleApiError(error, {
            toolId: "list_recordings",
            resource: input.platform
          });
        }
      }
    );
  }
});

"use strict";
async function apiCall(token, method, path, body) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${env.API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : void 0
  });
}
const importRecordingsTool = createTool({
  id: "import_recordings",
  description: "Import recordings from a connected platform by their IDs. Use list_recordings first to get available recording IDs.",
  inputSchema: z.object({
    platform: z.enum(["fireflies", "grain"]).describe("Which platform the recordings are from"),
    recording_ids: z.array(z.string()).min(1).max(20).describe("Array of recording IDs to import (max 20)"),
    client_id: z.string().optional().describe("Client UUID to associate imported transcripts with"),
    meeting_type: z.enum(["client_call", "intake", "follow_up"]).optional().describe("Type of meeting for all imported recordings")
  }),
  outputSchema: z.string(),
  mcp: {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  execute: async (input, context) => {
    const userToken = extractToken(context);
    if (!userToken) {
      return formatError(
        "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
      );
    }
    return logToolCall(
      { tool: "import_recordings", userId: "unknown", clientParam: input.platform },
      async () => {
        try {
          const response = await apiCall(userToken, "POST", "/transcripts/import", {
            platform: input.platform,
            recordingIds: input.recording_ids,
            clientId: input.client_id,
            meetingType: input.meeting_type
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errObj = errorData["error"];
            const message = errObj ? errObj["message"] ?? "Unknown error" : `API returned ${response.status}`;
            return formatError(message);
          }
          const data = await response.json();
          const succeeded = data.results.filter((r) => r.success);
          const failed = data.results.filter((r) => !r.success);
          const lines = [
            `Import complete: ${succeeded.length} succeeded, ${failed.length} failed.`,
            ""
          ];
          if (succeeded.length > 0) {
            lines.push("Imported:");
            for (const r of succeeded) {
              lines.push(`  - ${r.recordingId} \u2192 Transcript ${r.transcriptId}`);
            }
          }
          if (failed.length > 0) {
            lines.push("");
            lines.push("Failed:");
            for (const r of failed) {
              lines.push(`  - ${r.recordingId}: ${r.error ?? "Unknown error"}`);
            }
          }
          return lines.join("\n");
        } catch (error) {
          return handleApiError(error, {
            toolId: "import_recordings",
            resource: input.platform
          });
        }
      }
    );
  }
});

"use strict";
const mcpTools = {
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
  ingest_from_url: ingestFromUrlTool,
  ingest_from_text: ingestFromTextTool,
  list_recordings: listRecordingsTool,
  import_recordings: importRecordingsTool
};

"use strict";
const invokeRoute = {
  path: "/invoke",
  method: "POST",
  handler: async (c) => {
    const payload = await c.req.json();
    if (!payload.workflowType || !payload.workflowRunId) {
      return c.json(
        { error: "Missing required fields: workflowType, workflowRunId" },
        400
      );
    }
    if (payload.workflowType === "intake") {
      if (!payload.transcriptId || !payload.clientId) {
        return c.json(
          { error: "Missing required fields for intake: transcriptId, clientId" },
          400
        );
      }
      const input = {
        workflowRunId: payload.workflowRunId,
        clientId: payload.clientId,
        transcriptId: payload.transcriptId,
        callbackBaseUrl: payload.callbackBaseUrl
      };
      runIntakeAgent(input).then(() => {
        console.log(`[invoke] Intake agent completed for workflow ${payload.workflowRunId}`);
      }).catch((err) => {
        console.error(`[invoke] Intake agent FAILED for workflow ${payload.workflowRunId}:`, err);
      });
      return c.json(
        { accepted: true, workflowRunId: payload.workflowRunId },
        202
      );
    }
    if (payload.workflowType === "agenda") {
      return c.json(
        { error: "Agenda workflow invocation not yet implemented" },
        501
      );
    }
    return c.json({ error: `Unknown workflow type: ${payload.workflowType}` }, 400);
  }
};
const invokeSyncRoute = {
  path: "/invoke-sync",
  method: "POST",
  handler: async (c) => {
    const payload = await c.req.json();
    if (payload.workflowType !== "intake" || !payload.transcriptId || !payload.clientId) {
      return c.json({ error: "intake + transcriptId + clientId required" }, 400);
    }
    const input = {
      workflowRunId: payload.workflowRunId,
      clientId: payload.clientId,
      transcriptId: payload.transcriptId,
      callbackBaseUrl: payload.callbackBaseUrl
    };
    try {
      const logger = {
        info: (msg, data) => console.log(`[intake-sync] INFO: ${msg}`, JSON.stringify(data ?? {})),
        debug: (msg, data) => console.log(`[intake-sync] DEBUG: ${msg}`, JSON.stringify(data ?? {})),
        warn: (msg, data) => console.warn(`[intake-sync] WARN: ${msg}`, JSON.stringify(data ?? {})),
        error: (msg, data) => console.error(`[intake-sync] ERROR: ${msg}`, JSON.stringify(data ?? {}))
      };
      await runIntakeAgent(input, logger);
      return c.json({ success: true }, 200);
    } catch (err) {
      console.error("[invoke-sync] EXCEPTION:", err);
      return c.json(
        { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : void 0 },
        500
      );
    }
  }
};

"use strict";
const serviceTokenManager = new ServiceTokenManager({
  issuerUrl: env.AUTH_ISSUER_URL,
  clientId: env.MASTRA_CLIENT_ID,
  clientSecret: env.MASTRA_CLIENT_SECRET
});
await serviceTokenManager.initialize();
initializeApiClient(serviceTokenManager);
const mastra = new Mastra({
  agents: {
    intakeAgent,
    agendaAgent
  },
  tools: {
    ...mcpTools
  },
  server: {
    port: env.MASTRA_PORT,
    host: env.MASTRA_HOST,
    apiRoutes: [invokeRoute, invokeSyncRoute]
  },
  logger: createLogger({
    name: env.OTEL_SERVICE_NAME,
    level: env.NODE_ENV === "production" ? LogLevel.WARN : LogLevel.INFO
  })
});

"use strict";

export { mastra };
