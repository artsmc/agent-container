# GS — Gherkin Specification
# Feature 18: Mastra Runtime Setup

## Feature: Mastra Runtime Initialization

  As the iExcel automation system
  I need a configured Mastra agent runtime
  So that downstream agents (Workflow A, Workflow B) and the MCP server have a properly authenticated, observable foundation to build on

---

## Feature: Environment Configuration Validation

  Background:
    Given the Mastra application is being started
    And the `src/config/env.ts` module is the first module loaded

  Scenario: Startup succeeds with all required environment variables set
    Given the following environment variables are set:
      | Variable                | Value                              |
      | API_BASE_URL            | http://api:8080                    |
      | AUTH_ISSUER_URL         | https://auth.iexcel.com            |
      | MASTRA_CLIENT_ID        | mastra-agent                       |
      | MASTRA_CLIENT_SECRET    | <valid-secret>                     |
      | LLM_API_KEY             | <valid-llm-key>                    |
      | LLM_PROVIDER            | openai                             |
      | LLM_MODEL               | openai/gpt-4o                      |
    When the Mastra application starts
    Then the env module exports a typed `env` object with all values populated
    And no error is thrown during env validation
    And the process continues to the token acquisition phase

  Scenario: Startup fails when a required environment variable is missing
    Given the environment variable `MASTRA_CLIENT_SECRET` is not set
    When the Mastra application attempts to start
    Then a startup error is logged naming `MASTRA_CLIENT_SECRET` as missing
    And the process exits with a non-zero exit code
    And the Mastra server never starts

  Scenario: Startup fails when multiple required environment variables are missing
    Given the environment variables `AUTH_ISSUER_URL` and `LLM_API_KEY` are not set
    When the Mastra application attempts to start
    Then a startup error is logged naming both `AUTH_ISSUER_URL` and `LLM_API_KEY` as missing
    And the process exits with a non-zero exit code

  Scenario: Optional OTEL variables absent — observability gracefully disabled
    Given all required environment variables are set
    And `OTEL_EXPORTER_OTLP_ENDPOINT` is not set
    When the Mastra application starts
    Then no OpenTelemetry exporter is initialized
    And no connection errors are logged for the OTEL endpoint
    And the Mastra server starts normally

  Scenario: LLM_PROVIDER is "openai" — sets OPENAI_API_KEY
    Given `LLM_PROVIDER` is `openai`
    And `LLM_API_KEY` is `sk-abc123`
    When the env module is loaded
    Then `process.env.OPENAI_API_KEY` is set to `sk-abc123`
    And `process.env.ANTHROPIC_API_KEY` is not set

  Scenario: LLM_PROVIDER is "anthropic" — sets ANTHROPIC_API_KEY
    Given `LLM_PROVIDER` is `anthropic`
    And `LLM_API_KEY` is `sk-ant-abc123`
    When the env module is loaded
    Then `process.env.ANTHROPIC_API_KEY` is set to `sk-ant-abc123`
    And `process.env.OPENAI_API_KEY` is not set

---

## Feature: Service Token Acquisition (OIDC Client Credentials)

  Background:
    Given all required environment variables are set
    And the auth service is running at `AUTH_ISSUER_URL`
    And the OIDC client `mastra-agent` is registered in the auth service

  Scenario: Service token is obtained successfully on startup
    Given the auth service accepts client credentials for `mastra-agent`
    When the `ServiceTokenManager` is initialized
    Then a POST request is sent to the auth service token endpoint
    With `client_id=mastra-agent`, `client_secret=<secret>`, `grant_type=client_credentials`
    And a valid access token is returned and cached in memory
    And the token's expiry time is recorded

  Scenario: Service token is refreshed before expiry
    Given a service token was obtained with an expiry 90 seconds from now
    When 30 seconds have elapsed (60 seconds remain before expiry)
    Then the `ServiceTokenManager` initiates a proactive token refresh
    And a new access token is obtained from the auth service
    And the old token is replaced in the cache
    And API calls during the refresh window use the existing valid token

  Scenario: `getToken()` returns a valid cached token
    Given a service token is cached with an expiry 5 minutes from now
    When `serviceTokenManager.getToken()` is called
    Then the cached token is returned immediately
    And no network request is made to the auth service

  Scenario: `getToken()` waits for an in-progress refresh
    Given a token refresh is currently in progress
    When `serviceTokenManager.getToken()` is called concurrently
    Then the call waits for the in-progress refresh to complete
    And returns the newly obtained token
    And only one network request is made (not two concurrent requests)

  Scenario: Startup token acquisition fails — retry succeeds
    Given the auth service is temporarily unavailable
    When the `ServiceTokenManager` attempts to obtain a token
    Then the first attempt fails
    And the manager waits 5 seconds
    And retries (up to 3 total attempts)
    And if the auth service recovers within the retry window, a token is obtained
    And startup continues

  Scenario: Startup token acquisition fails after all retries
    Given the auth service is unreachable for all 3 attempts
    When the `ServiceTokenManager` exhausts retries
    Then an error is logged with the underlying reason
    And the process exits with a non-zero exit code
    And the Mastra server never starts

  Scenario: Runtime token refresh fails — retries with backoff
    Given the Mastra server is running
    And the current service token expires in 55 seconds (within the 60-second refresh threshold)
    And the auth service returns a 503 error
    When the proactive refresh is triggered
    Then the manager retries up to 3 times with exponential backoff (1s, 2s, 4s)
    And logs a `warn`-level message on each failure
    And if all retries fail, throws a typed error so the next `getToken()` call fails explicitly

---

## Feature: Mastra Server Startup

  Background:
    Given all required environment variables are set
    And a valid service token has been obtained

  Scenario: Mastra server starts on the correct port
    Given `MASTRA_PORT` is not set
    When the Mastra server starts
    Then it binds to port `8081`
    And it binds to host `0.0.0.0`
    And a startup log message is emitted: `Mastra server started on http://0.0.0.0:8081`

  Scenario: Mastra server port overridden by environment variable
    Given `MASTRA_PORT` is `9000`
    When the Mastra server starts
    Then it binds to port `9000`

  Scenario: Registered agents are accessible via the Mastra instance
    Given the Mastra instance is initialized with `intakeAgent` and `agendaAgent`
    When `mastra.getAgent('intake-agent')` is called
    Then the `intakeAgent` instance is returned
    When `mastra.getAgent('agenda-agent')` is called
    Then the `agendaAgent` instance is returned

---

## Feature: Health Endpoint

  Scenario: Health endpoint returns 200 OK
    Given the Mastra server is running
    When a GET request is sent to `http://localhost:8081/health`
    Then the response status is `200 OK`
    And the response Content-Type is `application/json`
    And the response body contains `"status": "ok"`
    And the response body contains `"service": "iexcel-mastra"`

  Scenario: Health endpoint responds when LLM provider is unavailable
    Given the Mastra server is running
    And the LLM provider API key is temporarily rejected (simulated)
    When a GET request is sent to `/health`
    Then the response status is still `200 OK`
    And the health endpoint does not attempt to contact the LLM provider

  Scenario: Health endpoint responds during service token refresh
    Given the Mastra server is running
    And a token refresh is in progress
    When a GET request is sent to `/health`
    Then the response status is `200 OK`
    And the response is not blocked by the token refresh

---

## Feature: Placeholder Agent Definitions

  Scenario: Intake agent placeholder is correctly structured
    Given the `intakeAgent` is imported from `src/agents/intake-agent.ts`
    Then its `id` is `'intake-agent'`
    And its `name` is `'Intake Agent'`
    And it has a non-empty `instructions` string
    And its `model` matches the configured `LLM_MODEL` environment variable
    And it has `tools` referencing transcript tools and task tools

  Scenario: Agenda agent placeholder is correctly structured
    Given the `agendaAgent` is imported from `src/agents/agenda-agent.ts`
    Then its `id` is `'agenda-agent'`
    And its `name` is `'Agenda Agent'`
    And it has a non-empty `instructions` string
    And its `model` matches the configured `LLM_MODEL` environment variable
    And it has `tools` referencing task tools and agenda tools

  Scenario: Calling a placeholder tool's execute function throws a descriptive error
    Given the `createDraftTasks` tool is imported from `src/tools/task-tools.ts`
    When its `execute` function is called with any input
    Then it throws an error with message `'This tool is not yet implemented. See feature 19/20.'`
    And does not silently return undefined or null

---

## Feature: API Client Wiring

  Scenario: Service api-client attaches service token to requests
    Given the `ServiceTokenManager` holds a valid token `Bearer abc123`
    And the service api-client is constructed with the service token provider
    When the api-client makes any API call
    Then the `Authorization: Bearer abc123` header is included in the request

  Scenario: User-scoped api-client attaches user token to requests
    Given a user token `Bearer user-xyz` is available from an MCP request context
    And a user-scoped api-client is constructed with `getAccessToken: async () => 'user-xyz'`
    When the user-scoped api-client makes an API call
    Then the `Authorization: Bearer user-xyz` header is included
    And the `Authorization: Bearer abc123` (service token) is NOT used

  Scenario: API client targets the correct base URL
    Given `API_BASE_URL` is `http://api:8080`
    When the api-client makes a request to the task creation endpoint
    Then the request URL begins with `http://api:8080`

---

## Feature: Observability

  Scenario: OpenTelemetry tracing is active when OTEL endpoint is configured
    Given `OTEL_EXPORTER_OTLP_ENDPOINT` is `http://otel-collector:4318`
    And `OTEL_SERVICE_NAME` is `iexcel-mastra`
    When the Mastra instance is initialized
    Then an OTLP exporter is configured pointing to `http://otel-collector:4318`
    And the service name reported in traces is `iexcel-mastra`

  Scenario: Agent invocation produces an OpenTelemetry trace span
    Given OpenTelemetry tracing is active
    And an agent is invoked via `mastra.getAgent('intake-agent').generate()`
    Then a trace span is created for the agent invocation
    And the span includes the agent ID in its attributes

  Scenario: Pino logger is configured with the correct log level
    Given `NODE_ENV` is `production`
    When the Mastra instance is initialized
    Then the Pino logger is configured with level `info`
    When `NODE_ENV` is `development`
    Then the Pino logger is configured with level `debug`

---

## Feature: Nx Build Targets

  Scenario: `nx run mastra:serve` starts the development server
    Given the `apps/mastra/project.json` defines a `serve` target
    When `nx run mastra:serve` is executed in the monorepo root
    Then the Mastra development server starts
    And logs are emitted to stdout
    And the health endpoint is reachable at `http://localhost:8081/health`

  Scenario: `nx run mastra:build` produces a build artifact
    Given the `apps/mastra/project.json` defines a `build` target
    When `nx run mastra:build` is executed
    Then the build completes without errors
    And a deployable artifact is produced in `dist/apps/mastra/`

  Scenario: `nx run mastra:type-check` passes with no errors
    Given all placeholder modules are in place
    When `nx run mastra:type-check` is executed
    Then `tsc --noEmit` runs without TypeScript errors

  Scenario: Mastra is marked affected when api-client package changes
    Given `packages/api-client/` has a file modification
    When `nx affected:list` is run
    Then `mastra` appears in the affected project list

  Scenario: Mastra is marked affected when auth-client package changes
    Given `packages/auth-client/` has a file modification
    When `nx affected:list` is run
    Then `mastra` appears in the affected project list
