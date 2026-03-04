# Gherkin Specification
# Feature 01: shared-types-package

## Feature: Shared Types Package

  As a developer building features in the iExcel automation system
  I need a single authoritative source of TypeScript type definitions
  So that all applications share consistent data contracts and type safety is enforced across service boundaries

---

## Feature: Package Structure and Configuration

  Background:
    Given the Nx monorepo has been scaffolded (feature 00)
    And the root tsconfig.base.json contains the path alias "@iexcel/shared-types"
    And the packages/shared-types/ directory exists with a project.json

  Scenario: Package compiles successfully under strict TypeScript settings
    Given the shared-types package source files exist at packages/shared-types/src/
    When the TypeScript compiler runs with "strict": true
    Then compilation completes with zero errors
    And zero warnings are emitted

  Scenario: Package exports zero runtime JavaScript values
    Given the shared-types package has been compiled
    When the compiled output is inspected
    Then only .d.ts declaration files are present
    And no .js files with runtime values exist in the output

  Scenario: All types are accessible via the package name alias
    Given a consumer application (e.g., apps/api) imports from "@iexcel/shared-types"
    When the TypeScript compiler resolves the import
    Then all exported types are available without path-traversal imports
    And the consumer does not import from a relative path like "../../packages/shared-types/src/task"

  Scenario: Package has no internal monorepo dependencies
    Given the shared-types package.json and tsconfig.json are inspected
    When the dependency tree is analyzed
    Then shared-types has zero dependencies on other @iexcel/* packages
    And the Nx dependency graph shows shared-types as the root node

---

## Feature: Task Types (task.ts)

  Background:
    Given the task.ts module is fully compiled and exported via index.ts

  Scenario: ShortId branded type prevents plain string assignment
    Given the ShortId branded type is defined as a string brand
    When a developer attempts to assign a plain string to a ShortId variable without casting
    Then the TypeScript compiler produces a type error
    And the error message indicates the types are not assignable

  Scenario: TaskStatus enum covers all valid lifecycle states
    Given the TaskStatus enum is defined
    Then it contains the value "draft"
    And it contains the value "approved"
    And it contains the value "rejected"
    And it contains the value "pushed"
    And it does NOT contain the value "completed"

  Scenario: NormalizedTask requires all non-nullable core fields
    Given the NormalizedTask interface is defined
    When a developer creates an object without the required "id" field
    Then the TypeScript compiler produces a type error
    When a developer creates an object without the required "shortId" field
    Then the TypeScript compiler produces a type error
    When a developer creates an object without the required "status" field
    Then the TypeScript compiler produces a type error

  Scenario: NormalizedTask.externalRef is null before a task is pushed
    Given a NormalizedTask object representing a draft task
    When the externalRef field is inspected
    Then it is typed as ExternalRef | null
    And assigning null to externalRef is a valid TypeScript operation

  Scenario: ExternalRef models multi-PM-tool support
    Given the ExternalRef interface is defined
    When a developer sets externalRef.system to "asana"
    Then the TypeScript compiler accepts the value
    When a developer sets externalRef.system to "monday"
    Then the TypeScript compiler accepts the value
    And no enum constraint restricts the system field to only known values

  Scenario: TaskDescription requires all three structured sections
    Given the TaskDescription interface is defined
    Then it contains a required "taskContext" field of type string
    And it contains a required "additionalContext" field of type string
    And it contains a required "requirements" field of type string
    When a developer creates a TaskDescription without the "requirements" field
    Then the TypeScript compiler produces a type error

  Scenario: TaskVersion captures immutable edit history
    Given the TaskVersion interface is defined
    Then it contains the fields: id, taskId, version, title, description, estimatedTime, editedBy, source, createdAt
    And "editedBy" is typed as string | null to support agent-authored versions
    And "source" uses the TaskSource enum

  Scenario: UpdateTaskRequest allows partial task edits
    Given the UpdateTaskRequest interface is defined
    When a developer creates an UpdateTaskRequest with only the "title" field
    Then the TypeScript compiler accepts the partial object
    When a developer creates an UpdateTaskRequest with all fields
    Then the TypeScript compiler also accepts the complete object

---

## Feature: Agenda Types (agenda.ts)

  Background:
    Given the agenda.ts module is fully compiled and exported via index.ts

  Scenario: AgendaShortId is distinct from task ShortId
    Given both ShortId and AgendaShortId are defined as branded types
    When a developer attempts to assign a ShortId value to an AgendaShortId variable
    Then the TypeScript compiler produces a type error
    And the error confirms the brands are incompatible

  Scenario: AgendaStatus enum covers all valid lifecycle states
    Given the AgendaStatus enum is defined
    Then it contains the value "draft"
    And it contains the value "in_review"
    And it contains the value "finalized"
    And it contains the value "shared"

  Scenario: Agenda URL tokens are null until share action is taken
    Given the Agenda interface is defined
    When a developer inspects the sharedUrlToken field type
    Then it is typed as string | null
    When a developer inspects the internalUrlToken field type
    Then it is typed as string | null

  Scenario: AgendaVersion reuses TaskSource enum
    Given the AgendaVersion interface is defined
    When a developer inspects the source field
    Then it uses the TaskSource enum from task.ts
    And the values "agent", "ui", and "terminal" are all valid

---

## Feature: Client Types (client.ts)

  Background:
    Given the client.ts module is fully compiled and exported via index.ts

  Scenario: Client has nullable external system references
    Given the Client interface is defined
    When a developer inspects the grainPlaylistId field
    Then it is typed as string | null
    When a developer inspects the defaultAsanaWorkspaceId field
    Then it is typed as string | null

  Scenario: EmailRecipients is a structured array, not a plain string array
    Given the EmailRecipient interface is defined with "name" and "email" fields
    When a developer attempts to assign a plain string to an EmailRecipients variable
    Then the TypeScript compiler produces a type error
    And the error indicates that string is not assignable to EmailRecipient

  Scenario: AsanaWorkspace stores a reference, not the actual access token
    Given the AsanaWorkspace interface is defined
    When a developer inspects the accessTokenRef field
    Then it is typed as string
    And JSDoc documentation clarifies this is a reference to a secret manager entry, not the token value itself

---

## Feature: Auth Types (auth.ts)

  Background:
    Given the auth.ts module is fully compiled and exported via index.ts

  Scenario: UserRole enum covers all product-level roles
    Given the UserRole enum is defined
    Then it contains the value "admin"
    And it contains the value "account_manager"
    And it contains the value "team_member"

  Scenario: OidcTokenClaims matches the auth service token structure
    Given the OidcTokenClaims interface is defined
    Then it contains "iss" as a string field
    And it contains "sub" as a string field
    And it contains "aud" as a string field
    And it contains "email" as a string field
    And it contains "name" as a string field
    And it contains "iat" as a number field
    And it contains "exp" as a number field

  Scenario: ProductUser links to the auth service via authUserId
    Given the ProductUser interface is defined
    When a developer inspects the authUserId field
    Then it is typed as string
    And JSDoc documentation clarifies it corresponds to the "sub" claim in the OIDC token

---

## Feature: Transcript Types (transcript.ts)

  Background:
    Given the transcript.ts module is fully compiled and exported via index.ts

  Scenario: NormalizedTranscript has a segments array for structured content
    Given the NormalizedTranscript interface is defined
    When a developer inspects the segments field
    Then it is typed as TranscriptSegment[]
    And each segment has a "speaker" string field
    And each segment has a "timestamp" number field (seconds offset)
    And each segment has a "text" string field

  Scenario: NormalizedTranscript source is extensible
    Given TranscriptSource is defined as a union type "grain" | "manual"
    When a developer assigns "grain" to a TranscriptSource field
    Then the TypeScript compiler accepts the value
    When a developer assigns "manual" to a TranscriptSource field
    Then the TypeScript compiler accepts the value
    When a developer assigns "zoom" to a TranscriptSource field
    Then the TypeScript compiler produces a type error (until the union is extended)

  Scenario: NormalizedTranscript optional fields can be null
    Given a NormalizedTranscript object with no summary
    When the summary field is set to null
    Then the TypeScript compiler accepts the null value
    Given a NormalizedTranscript object with no highlights
    When the highlights field is set to null
    Then the TypeScript compiler accepts the null value

  Scenario: MeetingType enum matches database call_type values
    Given the MeetingType enum is defined
    Then it contains the value "client_call"
    And it contains the value "intake"
    And it contains the value "follow_up"

---

## Feature: API Contract Types (api.ts)

  Background:
    Given the api.ts module is fully compiled and exported via index.ts

  Scenario: ApiErrorResponse matches the standard API error envelope
    Given the ApiErrorResponse interface is defined
    When a developer creates a valid error response object
    Then the object has a top-level "error" field of type ApiError
    And the ApiError has a "code" field using ApiErrorCode enum
    And the ApiError has a "message" field of type string
    And the ApiError has an optional "details" field

  Scenario: ApiErrorCode enum covers all documented error codes
    Given the ApiErrorCode enum is defined
    Then it contains "UNAUTHORIZED"
    And it contains "FORBIDDEN"
    And it contains "CLIENT_NOT_FOUND"
    And it contains "TASK_NOT_APPROVABLE"
    And it contains "AGENDA_NOT_FINALIZABLE"
    And it contains "PUSH_FAILED"
    And it contains "WORKSPACE_NOT_CONFIGURED"

  Scenario: PaginatedResponse is a generic type accepting any entity
    Given the PaginatedResponse generic interface is defined
    When a developer creates a PaginatedResponse<NormalizedTask>
    Then the TypeScript compiler accepts it and the data field is typed as NormalizedTask[]
    When a developer creates a PaginatedResponse<Agenda>
    Then the TypeScript compiler accepts it and the data field is typed as Agenda[]

  Scenario: GetTaskResponse includes version history
    Given the GetTaskResponse interface is defined
    Then it has a "task" field of type NormalizedTask
    And it has a "versions" field of type TaskVersion[]

  Scenario: BatchOperationResponse supports partial success
    Given the BatchOperationResponse interface is defined
    Then it has a "succeeded" field typed as string[]
    And it has a "failed" field typed as an array of objects with "id" and "error" fields
    And the "error" field in the failed array uses the ApiError type

  Scenario: ShareAgendaResponse returns complete URLs
    Given the ShareAgendaResponse interface is defined
    Then it has a "sharedUrl" field of type string
    And it has an "internalUrl" field of type string
    And neither field is nullable (URL is always returned after a successful share action)

  Scenario: EmailAgendaRequest makes recipients optional
    Given the EmailAgendaRequest interface is defined
    When a developer creates an EmailAgendaRequest with no "recipients" field
    Then the TypeScript compiler accepts the empty object
    When a developer creates an EmailAgendaRequest with a "recipients" field
    Then the recipients field must conform to the EmailRecipients type

---

## Feature: Barrel Export (index.ts)

  Scenario: All public types are accessible from the package root
    Given the index.ts barrel export is implemented
    When a consumer imports from "@iexcel/shared-types"
    Then NormalizedTask is importable
    And NormalizedTranscript is importable
    And Agenda is importable
    And Client is importable
    And ProductUser is importable
    And ApiErrorCode is importable
    And all other defined types are importable

  Scenario: No type name collisions in the barrel export
    Given all modules are re-exported from index.ts
    When the TypeScript compiler processes index.ts
    Then no duplicate export identifier errors are produced
    And each exported name is unique across all modules

  Scenario: Downstream feature can import and use types without errors
    Given feature 08 (input-normalizer-text) imports NormalizedTranscript from "@iexcel/shared-types"
    When feature 08's TypeScript source is compiled
    Then no "cannot find module" or "type not found" errors are produced
    Given feature 12 (output-normalizer-asana) imports NormalizedTask and ExternalRef from "@iexcel/shared-types"
    When feature 12's TypeScript source is compiled
    Then no type resolution errors are produced
