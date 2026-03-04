# Gherkin Specification
# Feature 22: API Client Package (`packages/api-client`)

**Date:** 2026-03-03

---

## Feature: API Client Package

As a consumer of the iExcel API (UI, Mastra, or terminal tool),
I want a typed, auth-aware API client library,
So that I can call all API endpoints without managing HTTP, tokens, or error parsing manually.

---

## Feature: Token Attachment

### Background

```gherkin
Given the api-client is instantiated with baseUrl "https://api.iexcel.test"
And the TokenProvider returns access token "valid-token-abc"
```

### Scenario: Access token is attached to every authenticated request

```gherkin
Given the TokenProvider returns access token "valid-token-abc"
When the consumer calls listClients()
Then the HTTP request is made to "GET https://api.iexcel.test/clients"
And the request includes the header "Authorization: Bearer valid-token-abc"
```

### Scenario: Public endpoint bypasses token attachment

```gherkin
Given the consumer calls getSharedAgenda("share-token-xyz")
When the HTTP request is constructed
Then the request is made to "GET https://api.iexcel.test/shared/share-token-xyz"
And the request does NOT include an "Authorization" header
And TokenProvider.getAccessToken is NOT called
```

### Scenario: Token is fetched fresh before each request

```gherkin
Given the TokenProvider.getAccessToken returns different tokens on successive calls
When the consumer makes two separate requests
Then each request uses the token returned by the respective getAccessToken call
```

---

## Feature: Automatic Token Refresh on 401

### Scenario: Client retries with refreshed token on 401 response

```gherkin
Given the initial access token "expired-token" is attached
And the API returns 401 for "expired-token"
And TokenProvider.refreshAccessToken returns "new-valid-token"
When the consumer calls getClient("client-123")
Then the client calls TokenProvider.refreshAccessToken once
And retries "GET /clients/client-123" with header "Authorization: Bearer new-valid-token"
And the response is returned successfully to the consumer
```

### Scenario: Client throws after second consecutive 401

```gherkin
Given the initial access token "expired-token" is attached
And the API returns 401 for both "expired-token" and "refreshed-token"
And TokenProvider.refreshAccessToken returns "refreshed-token"
When the consumer calls getClient("client-123")
Then the client calls TokenProvider.refreshAccessToken exactly once
And throws an ApiClientError with code "UNAUTHORIZED"
And the error statusCode is 401
```

### Scenario: Token refresh is not triggered on non-401 errors

```gherkin
Given the API returns 403 for the current access token
When the consumer calls getClient("client-123")
Then the client does NOT call TokenProvider.refreshAccessToken
And throws an ApiClientError with code "FORBIDDEN"
And the error statusCode is 403
```

---

## Feature: Typed Error Handling

### Scenario: API error response is parsed into typed ApiClientError

```gherkin
Given the API returns 422 with body:
  """
  {
    "error": {
      "code": "TASK_NOT_APPROVABLE",
      "message": "Task is in draft status and must be reviewed before approval.",
      "details": { "task_id": "abc-123", "current_status": "draft" }
    }
  }
  """
When the consumer calls approveTask("abc-123")
Then the client throws an ApiClientError
And error.code is "TASK_NOT_APPROVABLE"
And error.message is "Task is in draft status and must be reviewed before approval."
And error.statusCode is 422
And error.details.task_id is "abc-123"
```

### Scenario: Unexpected non-JSON error response is wrapped

```gherkin
Given the API returns 502 with an HTML body "<html>Bad Gateway</html>"
When the consumer calls pushTask("task-123")
Then the client throws an ApiClientError
And error.code is "UNKNOWN_ERROR"
And error.statusCode is 502
And error.details contains the raw response body
```

### Scenario: Network failure is wrapped in ApiClientError

```gherkin
Given the underlying fetch call throws a network error "ECONNREFUSED"
When the consumer calls listClients()
Then the client throws an ApiClientError
And error.code is "NETWORK_ERROR"
And error.message contains "ECONNREFUSED"
```

---

## Feature: Task Endpoint Methods

### Scenario: List tasks with status filter

```gherkin
Given a valid authenticated client
When the consumer calls listTasks("client-001", { status: "draft", page: 1, limit: 20 })
Then the HTTP request is "GET /clients/client-001/tasks?status=draft&page=1&limit=20"
And the response is typed as GetTasksResponse
```

### Scenario: List tasks with transcriptId filter

```gherkin
Given a valid authenticated client
When the consumer calls listTasks("client-001", { transcriptId: "transcript-abc" })
Then the HTTP request is "GET /clients/client-001/tasks?transcriptId=transcript-abc"
```

### Scenario: Get task by short ID

```gherkin
Given a valid authenticated client
When the consumer calls getTask("TSK-0042")
Then the HTTP request is "GET /tasks/TSK-0042"
And the response includes the task and its versions
And the response is typed as GetTaskResponse
```

### Scenario: Get task by UUID

```gherkin
Given a valid authenticated client
When the consumer calls getTask("3f2504e0-4f89-11d3-9a0c-0305e82c3301")
Then the HTTP request is "GET /tasks/3f2504e0-4f89-11d3-9a0c-0305e82c3301"
```

### Scenario: Batch approve tasks returns partial success

```gherkin
Given a valid authenticated client
And the API response for batch approve is:
  """
  { "succeeded": ["TSK-0001", "TSK-0002"], "failed": [{ "id": "TSK-0003", "error": { "code": "FORBIDDEN", ... } }] }
  """
When the consumer calls batchApproveTasks("client-001", { taskIds: ["TSK-0001", "TSK-0002", "TSK-0003"] })
Then the response is typed as BatchOperationResponse
And response.succeeded contains ["TSK-0001", "TSK-0002"]
And response.failed contains one entry with id "TSK-0003"
And no ApiClientError is thrown
```

---

## Feature: Agenda Endpoint Methods

### Scenario: Get agenda by short ID includes version history

```gherkin
Given a valid authenticated client
When the consumer calls getAgenda("AGD-0015")
Then the HTTP request is "GET /agendas/AGD-0015"
And the response is typed as GetAgendaResponse
And the response includes the agenda and its versions
```

### Scenario: Email agenda with optional recipient override

```gherkin
Given a valid authenticated client
When the consumer calls emailAgenda("AGD-0015", { recipients: [{ name: "Client Name", email: "client@example.com" }] })
Then the HTTP request is "POST /agendas/AGD-0015/email"
And the request body is { "recipients": [{ "name": "Client Name", "email": "client@example.com" }] }
```

### Scenario: Email agenda with no body uses client defaults

```gherkin
Given a valid authenticated client
When the consumer calls emailAgenda("AGD-0015")
Then the HTTP request is "POST /agendas/AGD-0015/email"
And the request body is empty or omitted
```

### Scenario: Export agenda returns Google Doc details

```gherkin
Given a valid authenticated client
When the consumer calls exportAgenda("AGD-0015")
Then the HTTP request is "POST /agendas/AGD-0015/export"
And the response is typed as ExportAgendaResponse
And the response contains googleDocId and googleDocUrl
```

---

## Feature: Workflow Endpoint Methods

### Scenario: Trigger intake workflow returns workflow status

```gherkin
Given a valid authenticated client
When the consumer calls triggerIntakeWorkflow({ clientId: "client-001", transcriptId: "transcript-abc" })
Then the HTTP request is "POST /workflows/intake"
And the request body is { "clientId": "client-001", "transcriptId": "transcript-abc" }
And the response is typed as WorkflowStatusResponse
```

### Scenario: Poll workflow status until complete

```gherkin
Given a valid authenticated client
And a running workflow with id "wf-xyz"
When the consumer calls getWorkflowStatus("wf-xyz")
Then the HTTP request is "GET /workflows/wf-xyz/status"
And the response is typed as WorkflowStatusResponse
And the consumer may repeat this call to poll for completion
```

---

## Feature: Audit Log Query

### Scenario: Query audit log with date range filter

```gherkin
Given a valid authenticated client
When the consumer calls queryAuditLog({ entityType: "task", userId: "user-001", dateFrom: "2026-01-01", dateTo: "2026-03-01", page: 1, limit: 50 })
Then the HTTP request is "GET /audit?entity_type=task&user_id=user-001&date_from=2026-01-01&date_to=2026-03-01&page=1&limit=50"
And the response is typed as PaginatedResponse<AuditEntry>
```

### Scenario: Undefined filter params are omitted from query string

```gherkin
Given a valid authenticated client
When the consumer calls queryAuditLog({ entityType: "agenda" })
Then the HTTP request is "GET /audit?entity_type=agenda"
And no undefined or null parameters appear in the query string
```

---

## Feature: Asana Workspace Methods

### Scenario: Delete workspace returns void on success

```gherkin
Given a valid authenticated client
When the consumer calls deleteAsanaWorkspace("workspace-001")
Then the HTTP request is "DELETE /asana/workspaces/workspace-001"
And no error is thrown
And the method returns void
```

---

## Feature: Client Construction

### Scenario: Client is constructed with required parameters

```gherkin
Given baseUrl "https://api.iexcel.test" and a valid TokenProvider
When the consumer calls createApiClient({ baseUrl, tokenProvider })
Then a valid ApiClient instance is returned
```

### Scenario: Client uses injected fetch implementation in tests

```gherkin
Given a mock fetch implementation that returns predefined responses
When the consumer calls createApiClient({ baseUrl, tokenProvider, fetchImpl: mockFetch })
Then all HTTP calls are routed through mockFetch
And no real network requests are made
```

### Scenario: Base URL trailing slash is normalised

```gherkin
Given baseUrl "https://api.iexcel.test/"
When the consumer calls listClients()
Then the HTTP request is "GET https://api.iexcel.test/clients"
And the URL does not contain a double slash
```
