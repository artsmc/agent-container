# Task Update: Transcript Listing Page

**Date:** 2026-03-08
**Phase:** Implementation

## Summary

Built a global transcript listing feature across three layers: API endpoint, API client method, and Next.js UI page.

## Changes

### API Layer (`apps/api`)

1. **`src/services/transcript-types.ts`** -- Added three new types:
   - `ListAllTranscriptsParams`: Query parameters for the global transcript listing (userId, userRole, filters, pagination).
   - `TranscriptSummaryWithClient`: Extends `TranscriptSummary` with `client_name`, `source_platform`, and `is_imported`.
   - `ListAllTranscriptsResult`: Paginated result containing `TranscriptSummaryWithClient[]`.

2. **`src/repositories/transcript-repository.ts`** -- Added `listAllTranscripts()` function:
   - Admins see all transcripts (no access filtering).
   - Non-admins see transcripts for their assigned clients (via `client_users` join) plus unassigned transcripts (`client_id IS NULL`).
   - LEFT JOINs with `clients` table to include `client_name`.
   - Supports `callType`, `fromDate`, `toDate` filters plus `page`/`perPage` pagination.
   - Concurrent data + count queries using `Promise.all`.

3. **`src/routes/transcripts/list-all-transcripts.ts`** -- New route handler for `GET /transcripts`:
   - Lean handler: parses query params, delegates to repository, formats response.
   - Reuses `listTranscriptsQuerySchema` for validation.
   - Returns `{ data, pagination }` shape consistent with other list endpoints.

4. **`src/routes/transcripts/index.ts`** -- Registered the new `registerListAllTranscripts` handler.

### API Client (`packages/api-client`)

5. **`src/endpoints/transcripts.ts`** -- Added `listAllTranscripts()` method:
   - Hits `GET /transcripts` with optional query parameters.
   - Returns `ListAllTranscriptsResponse` type.
   - Exported `ListAllTranscriptsParams` query type.

6. **`src/core/api-client.ts`** -- Wired `listAllTranscripts` as a public property on `ApiClient`.

7. **`src/index.ts`** -- Exported `ListAllTranscriptsParams` type.

### Shared Types (`packages/shared-types`)

8. **`src/api.ts`** -- Added two new types:
   - `TranscriptListItem`: Summary row shape with client_name, source_platform, is_imported.
   - `ListAllTranscriptsResponse`: Full response shape with `data` and `pagination`.

### UI (`apps/ui`)

9. **`src/app/(dashboard)/transcripts/page.tsx`** -- Replaced stub with production transcript listing:
   - Server Component with async data fetching via `getApiClient().listAllTranscripts()`.
   - Suspense boundary with skeleton loading state (5-row shimmer animation).
   - Error handling with user-friendly error banner.
   - Empty state with CTA to create first transcript.
   - Table with columns: Date, Type, Client, Status, Source, Created.
   - Badge component for status (Processed/Imported/Pending).
   - Links to transcript detail pages.
   - Pagination info when total exceeds one page.

10. **`src/app/(dashboard)/transcripts/transcripts.module.scss`** -- New SCSS module:
    - Uses globally-injected `tokens` namespace (no explicit `@use`).
    - Full table styling, hover states, empty state, error banner, skeleton animation.
    - Consistent with project design patterns (spacing, colors, typography tokens).

## Architecture Notes

- The route handler follows the lean route pattern: no business logic in the route file.
- Access control logic is encapsulated in the repository function.
- The `listAllTranscripts` repository function is under 100 lines, well within the 350-line limit.
- No `any` types used (SQL type from drizzle-orm for filter conditions array).
