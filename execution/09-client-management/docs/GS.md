# GS — Gherkin Specification
# Feature 09: Client Management

---

## Feature: List Clients

### Background

```gherkin
Given the API is running
And the product database contains client records
And the following users exist:
  | user_id | role              | assigned_clients          |
  | usr-001 | admin             | (all)                     |
  | usr-002 | account_manager   | client-alpha, client-beta |
  | usr-003 | team_member       | client-alpha              |
And each user has a valid Bearer token
```

---

### Scenario: Admin lists all clients

```gherkin
Given I am authenticated as "usr-001" (admin)
When I send GET /clients
Then the response status is 200
And the response body contains a "data" array
And the "data" array includes all clients in the system
And the response body contains a "pagination" object with "total", "page", "per_page", "total_pages"
```

### Scenario: Account Manager lists only their assigned clients

```gherkin
Given I am authenticated as "usr-002" (account_manager)
When I send GET /clients
Then the response status is 200
And the "data" array contains exactly "client-alpha" and "client-beta"
And the "data" array does not contain any other client records
```

### Scenario: Team Member lists only their assigned clients

```gherkin
Given I am authenticated as "usr-003" (team_member)
When I send GET /clients
Then the response status is 200
And the "data" array contains exactly "client-alpha"
And the "data" array does not contain "client-beta"
```

### Scenario: Pagination defaults are applied

```gherkin
Given I am authenticated as "usr-001" (admin)
And there are 35 clients in the system
When I send GET /clients
Then the response status is 200
And the "pagination.page" is 1
And the "pagination.per_page" is 20
And the "pagination.total" is 35
And the "pagination.total_pages" is 2
And the "data" array contains 20 items
```

### Scenario: Requesting a specific page

```gherkin
Given I am authenticated as "usr-001" (admin)
And there are 35 clients in the system
When I send GET /clients?page=2&per_page=20
Then the response status is 200
And the "data" array contains 15 items
And the "pagination.page" is 2
```

### Scenario: per_page exceeds the maximum

```gherkin
Given I am authenticated as "usr-001" (admin)
When I send GET /clients?per_page=101
Then the response status is 400
And the error code is "INVALID_PAGINATION"
```

### Scenario: No token provided

```gherkin
Given I send GET /clients without an Authorization header
Then the response status is 401
And the error code is "UNAUTHORIZED"
```

### Scenario: Expired token

```gherkin
Given I send GET /clients with an expired Bearer token
Then the response status is 401
And the error code is "UNAUTHORIZED"
```

---

## Feature: Get Client Detail

### Scenario: Account Manager retrieves an assigned client

```gherkin
Given I am authenticated as "usr-002" (account_manager)
And "client-alpha" is assigned to "usr-002"
When I send GET /clients/client-alpha
Then the response status is 200
And the response body contains:
  | field                       | type    |
  | id                          | UUID    |
  | name                        | string  |
  | grain_playlist_id           | string  |
  | default_asana_workspace_id  | string  |
  | default_asana_project_id    | string  |
  | email_recipients            | array   |
  | created_at                  | ISO8601 |
  | updated_at                  | ISO8601 |
```

### Scenario: Account Manager cannot access an unassigned client

```gherkin
Given I am authenticated as "usr-002" (account_manager)
And "client-gamma" is NOT assigned to "usr-002"
When I send GET /clients/client-gamma
Then the response status is 404
And the error code is "CLIENT_NOT_FOUND"
```

### Scenario: Admin retrieves any client

```gherkin
Given I am authenticated as "usr-001" (admin)
And "client-gamma" exists in the system
When I send GET /clients/client-gamma
Then the response status is 200
And the response body contains the client record for "client-gamma"
```

### Scenario: Client does not exist

```gherkin
Given I am authenticated as "usr-001" (admin)
When I send GET /clients/00000000-0000-0000-0000-000000000000
Then the response status is 404
And the error code is "CLIENT_NOT_FOUND"
```

### Scenario: Invalid UUID format in path

```gherkin
Given I am authenticated as "usr-001" (admin)
When I send GET /clients/not-a-uuid
Then the response status is 400
And the error code is "INVALID_ID"
```

### Scenario: email_recipients is an empty array when not set

```gherkin
Given I am authenticated as "usr-001" (admin)
And "client-delta" has no email recipients configured
When I send GET /clients/client-delta
Then the response status is 200
And the "email_recipients" field is an empty array
```

---

## Feature: Update Client Configuration

### Scenario: Account Manager updates client name

```gherkin
Given I am authenticated as "usr-002" (account_manager)
And "client-alpha" is assigned to "usr-002"
When I send PATCH /clients/client-alpha with body:
  """
  { "name": "Alpha Corp (Renewed)" }
  """
Then the response status is 200
And the response body "name" is "Alpha Corp (Renewed)"
And the response body "updated_at" is later than the previous "updated_at"
And an audit log entry is created with action "client.updated" and changed_fields containing "name"
```

### Scenario: Account Manager updates email recipients

```gherkin
Given I am authenticated as "usr-002" (account_manager)
And "client-alpha" is assigned to "usr-002"
When I send PATCH /clients/client-alpha with body:
  """
  {
    "email_recipients": [
      { "name": "Jane Doe", "email": "jane@alpha.com" },
      { "name": "Bob Jones", "email": "bob@alpha.com" }
    ]
  }
  """
Then the response status is 200
And the response body "email_recipients" contains exactly the two provided recipients
And an audit log entry is created with changed_fields containing "email_recipients"
```

### Scenario: PATCH only updates provided fields, leaves others unchanged

```gherkin
Given I am authenticated as "usr-002" (account_manager)
And "client-alpha" has name "Alpha Corp" and grain_playlist_id "playlist-001"
When I send PATCH /clients/client-alpha with body:
  """
  { "name": "Alpha Corp Renamed" }
  """
Then the response status is 200
And the response body "name" is "Alpha Corp Renamed"
And the response body "grain_playlist_id" is still "playlist-001"
```

### Scenario: Admin updates a client they are not "assigned" to

```gherkin
Given I am authenticated as "usr-001" (admin)
And "client-gamma" exists but is not assigned to "usr-001" as an account manager
When I send PATCH /clients/client-gamma with body:
  """
  { "default_asana_workspace_id": "asana-ws-999" }
  """
Then the response status is 200
And the response body "default_asana_workspace_id" is "asana-ws-999"
```

### Scenario: Team Member cannot update client configuration

```gherkin
Given I am authenticated as "usr-003" (team_member)
And "client-alpha" is assigned to "usr-003"
When I send PATCH /clients/client-alpha with body:
  """
  { "name": "Attempted Name Change" }
  """
Then the response status is 403
And the error code is "FORBIDDEN"
And no audit log entry is created
```

### Scenario: Account Manager cannot update an unassigned client

```gherkin
Given I am authenticated as "usr-002" (account_manager)
And "client-gamma" is NOT assigned to "usr-002"
When I send PATCH /clients/client-gamma with body:
  """
  { "name": "Attempted Name Change" }
  """
Then the response status is 404
And the error code is "CLIENT_NOT_FOUND"
```

### Scenario: Empty name is rejected

```gherkin
Given I am authenticated as "usr-002" (account_manager)
When I send PATCH /clients/client-alpha with body:
  """
  { "name": "" }
  """
Then the response status is 400
And the error code is "INVALID_BODY"
And the error message references the "name" field
```

### Scenario: email_recipients item missing email field

```gherkin
Given I am authenticated as "usr-002" (account_manager)
When I send PATCH /clients/client-alpha with body:
  """
  { "email_recipients": [{ "name": "Jane Doe" }] }
  """
Then the response status is 400
And the error code is "INVALID_BODY"
And the error message references "email_recipients"
```

### Scenario: email_recipients item has malformed email

```gherkin
Given I am authenticated as "usr-002" (account_manager)
When I send PATCH /clients/client-alpha with body:
  """
  { "email_recipients": [{ "name": "Jane Doe", "email": "not-an-email" }] }
  """
Then the response status is 400
And the error code is "INVALID_BODY"
```

### Scenario: email_recipients exceeds maximum count

```gherkin
Given I am authenticated as "usr-002" (account_manager)
When I send PATCH /clients/client-alpha with body containing 51 email_recipients entries
Then the response status is 400
And the error code is "INVALID_BODY"
```

### Scenario: Empty body is rejected

```gherkin
Given I am authenticated as "usr-002" (account_manager)
When I send PATCH /clients/client-alpha with an empty JSON body {}
Then the response status is 400
And the error code is "INVALID_BODY"
```

### Scenario: Body contains unknown fields

```gherkin
Given I am authenticated as "usr-002" (account_manager)
When I send PATCH /clients/client-alpha with body:
  """
  { "unknown_field": "value" }
  """
Then the response status is 400
And the error code is "INVALID_BODY"
```

### Scenario: PATCH with null clears a nullable field

```gherkin
Given I am authenticated as "usr-002" (account_manager)
And "client-alpha" has grain_playlist_id "playlist-001"
When I send PATCH /clients/client-alpha with body:
  """
  { "grain_playlist_id": null }
  """
Then the response status is 200
And the response body "grain_playlist_id" is null
```

---

## Feature: Get Client Status

### Scenario: Account Manager retrieves client status with draft tasks

```gherkin
Given I am authenticated as "usr-002" (account_manager)
And "client-alpha" has the following tasks:
  | status   | count |
  | draft    | 6     |
  | approved | 4     |
  | pushed   | 10    |
  | rejected | 4     |
And "client-alpha" has a current agenda with status "in_review"
When I send GET /clients/client-alpha/status
Then the response status is 200
And the response body "tasks.draft" is 6
And the response body "tasks.pending_approval" is 6
And the response body "tasks.approved" is 4
And the response body "tasks.pushed" is 10
And the response body "tasks.rejected" is 4
And the response body "tasks.total" is 24
And the response body "agenda.current.status" is "in_review"
And the response body "agenda.is_ready_to_share" is false
```

### Scenario: Status shows agenda is ready to share when finalized

```gherkin
Given I am authenticated as "usr-002" (account_manager)
And "client-alpha" has a current agenda with status "finalized"
When I send GET /clients/client-alpha/status
Then the response status is 200
And the response body "agenda.is_ready_to_share" is true
And the response body "agenda.current.status" is "finalized"
```

### Scenario: Status returns null agenda when no agendas exist

```gherkin
Given I am authenticated as "usr-002" (account_manager)
And "client-alpha" has no agendas
When I send GET /clients/client-alpha/status
Then the response status is 200
And the response body "agenda.current" is null
And the response body "agenda.is_ready_to_share" is false
```

### Scenario: Status returns zeroed task counts for a new client

```gherkin
Given I am authenticated as "usr-001" (admin)
And "client-new" has no tasks and no agendas
When I send GET /clients/client-new/status
Then the response status is 200
And the response body "tasks.total" is 0
And the response body "tasks.draft" is 0
And the response body "agenda.current" is null
```

### Scenario: next_call field is null in V1

```gherkin
Given I am authenticated as "usr-002" (account_manager)
When I send GET /clients/client-alpha/status
Then the response status is 200
And the response body "next_call" is null
```

### Scenario: Team Member can view status

```gherkin
Given I am authenticated as "usr-003" (team_member)
And "client-alpha" is assigned to "usr-003"
When I send GET /clients/client-alpha/status
Then the response status is 200
```

### Scenario: Team Member cannot view status for unassigned client

```gherkin
Given I am authenticated as "usr-003" (team_member)
And "client-beta" is NOT assigned to "usr-003"
When I send GET /clients/client-beta/status
Then the response status is 404
And the error code is "CLIENT_NOT_FOUND"
```
