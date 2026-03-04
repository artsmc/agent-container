# Task List
## Feature 29: UI Shared Agenda (Client View)

**Version:** 1.0
**Date:** 2026-03-03

---

## Prerequisites

Before beginning implementation, confirm the following are in place:

- [ ] Feature 23 (ui-scaffolding) is complete — `PublicLayout.tsx`, `PublicLayout.module.scss`, and `ui-tokens` package exist
- [ ] Feature 22 (api-client-package) is complete — `apiClient.shared.getByToken(token)` method exists and is typed
- [ ] The `GET /shared/{token}` API endpoint is deployed and testable (Feature 14)
- [ ] Confirm with Feature 28 (ui-agenda-editor) team: are `running_notes` content fields stored as **markdown** or **HTML**? This determines rendering approach (see TR.md Section 10.2)

---

## Phase 1: Route and Layout Setup

### Task 1.1 — Create route directory
**Complexity:** Small
**References:** TR.md Section 2 (File Structure)

Create the App Router directory for the shared agenda route:

```
apps/ui/src/app/shared/[token]/
```

Create an empty `page.tsx` file with a minimal placeholder export to confirm routing works.

**Verification:** Navigate to `/shared/test-token` in the dev server — no 404 at the framework level (may show a blank page or error from missing API, not a routing error).

---

### Task 1.2 — Scaffold `SharedAgendaPage` component shell
**Complexity:** Small
**References:** TR.md Section 4.1, FRS.md FR-03

Create `apps/ui/src/app/shared/[token]/page.tsx` as an async Server Component:
- Accept `params: Promise<{ token: string }>` — await params per Next.js 16 API
- Import `PublicLayout` from Feature 23
- For now, return a static `<PublicLayout>` with placeholder content
- Confirm `"use client"` directive is absent (this is a Server Component)

**Verification:** Dev server renders the page at `/shared/any-token` with the PublicLayout chrome visible and no errors in the server console.

---

### Task 1.3 — Confirm auth middleware exclusion for `/shared/*`
**Complexity:** Small
**References:** TR.md Section 9.2, FRS.md FR-01

Locate the auth middleware file (`middleware.ts`). Verify that `/shared/*` routes are excluded from any auth redirect logic. If not excluded, add the exclusion pattern:

```typescript
// middleware.ts
export const config = {
  matcher: [
    '/((?!shared|_next/static|_next/image|favicon.ico).*)',
  ],
}
```

If Feature 24 middleware does not yet exist, add a comment in `page.tsx` noting that `/shared/[token]` must remain outside any future auth route group.

**Verification:** Navigating to `/shared/test-token` without any auth cookie does not redirect to a login page.

---

## Phase 2: API Integration

### Task 2.1 — Implement API call in page component
**Complexity:** Small
**References:** TR.md Section 3 (API Contract), FRS.md FR-04

In `SharedAgendaPage`, add the API call:
```typescript
const agenda = await apiClient.shared.getByToken(token)
```

Wrap in try/catch. For now, log errors and return a placeholder error div. Type the response using `SharedAgendaResponse` from the `api-client` package (or define a local interface if the package does not yet export it — coordinate with Feature 22).

**Verification:** With a valid token (from a test seeded agenda), the API call returns data and logs it to the server console.

---

### Task 2.2 — Implement `generateMetadata`
**Complexity:** Small
**References:** TR.md Section 4.2, FRS.md FR-16

Add `generateMetadata` function to `apps/ui/src/app/shared/[token]/page.tsx`:
- Fetch agenda data (same API call — React.cache deduplicates within request)
- Return title: `${client_name} — Agenda ${short_id} | iExcel`
- Return `robots: { index: false, follow: false }` unconditionally
- Handle fetch failure gracefully (return fallback title, still noindex)

**Verification:** View page source — `<title>` tag contains client name and short ID. `<meta name="robots">` contains "noindex, nofollow".

---

## Phase 3: Error Handling

### Task 3.1 — Create `SharedAgendaError` component
**Complexity:** Small
**References:** TR.md Section 4.7, FRS.md FR-13, FR-14, FR-15, GS.md Scenario Groups 3–5

Create `apps/ui/src/components/SharedAgenda/SharedAgendaError/SharedAgendaError.tsx`:
- Props: `type: 'invalid' | 'expired' | 'generic'`
- Error content map with heading, body, guidance for each type (see TR.md Section 4.7)
- Uses `PublicLayout` wrapper
- Create `SharedAgendaError.module.scss` with error page layout styles (centered, comfortable padding, brand-consistent typography via `ui-tokens`)
- Export via `index.ts`

**Verification:** Render each error type in isolation (Storybook or a test route) — correct heading/body/guidance for each type, styled consistently.

---

### Task 3.2 — Wire error handling into page component
**Complexity:** Small
**References:** TR.md Section 4.1, FRS.md FR-05

In `SharedAgendaPage`, replace the placeholder error div with proper `SharedAgendaError` rendering:
- `404` → `<SharedAgendaError type="invalid" />`
- `410` → `<SharedAgendaError type="expired" />`
- All other errors → `<SharedAgendaError type="generic" />`

Implement `isApiError(error, statusCode)` utility or use whatever typed error pattern the `api-client` package provides.

**Verification:**
- Navigate to `/shared/nonexistent` — "This link is not valid" page renders
- Simulate 410 (expired token in test data or mock) — "This link has expired" renders
- Simulate 500 (disable API or use invalid base URL) — "Something went wrong" renders

---

## Phase 4: Content Components

### Task 4.1 — Create `AgendaHeader` component
**Complexity:** Small
**References:** TR.md Section 4.3, FRS.md FR-06

Create `apps/ui/src/components/SharedAgenda/AgendaHeader/AgendaHeader.tsx`:
- Props: `short_id`, `client_name`, `cycle_start`, `cycle_end`, `finalized_at`
- Implement date formatting utility (locale-aware, e.g. `formatDateRange`, `formatDate`) in `apps/ui/src/lib/dates.ts`
- Create `AgendaHeader.module.scss` — use `ui-tokens` for all styling
- Export via `index.ts`

Date format targets:
- `cycle_start` / `cycle_end`: "February 1 – February 28, 2026" (abbreviated month ok: "Feb 1 – Feb 28, 2026")
- `finalized_at`: "February 28, 2026" (no time)

**Verification:** Render with sample data — all four data points display, dates are human-readable (not ISO strings).

---

### Task 4.2 — Create `RunningNotesSection` component
**Complexity:** Small
**References:** TR.md Section 4.5, FRS.md FR-07

Create `apps/ui/src/components/SharedAgenda/RunningNotesSection/RunningNotesSection.tsx`:
- Props: `heading: string`, `content: string | null | undefined`
- Render `<h2>` for section heading
- If content is empty/null: render placeholder "Nothing to report for this period."
- If content present: render via `RichTextRenderer` (see Task 4.3)
- Create `RunningNotesSection.module.scss` with section styles and `@media print` print break rules
- Export via `index.ts`

**Verification:** Render with content — markdown/HTML displays with formatting. Render with empty content — placeholder appears. Render six instances — visually consistent.

---

### Task 4.3 — Create `RichTextRenderer` utility component
**Complexity:** Medium
**References:** TR.md Section 4.5 (rich text rendering), TR.md Section 6.2 (XSS prevention)

**Decision gate:** This task depends on the confirmed format of `running_notes` content (markdown vs HTML — see Prerequisites). Implement accordingly:

**If markdown:**
- Install `marked` or `remark` + `remark-html`
- Convert markdown to HTML server-side in the component
- Sanitize output with `sanitize-html` before rendering

**If HTML:**
- Install `sanitize-html`
- Sanitize with allowlist: `p`, `ul`, `ol`, `li`, `strong`, `em`, `br`, `h3`, `h4`, `a`
- For `<a>` tags: restrict `href` to `https?://` protocols, add `rel="noopener noreferrer"`

Both paths use `dangerouslySetInnerHTML` on the **sanitized** output only.

Create `apps/ui/src/components/SharedAgenda/RichTextRenderer/RichTextRenderer.tsx`.

**Verification:** Render a string with bullet lists, bold text, and a link — correct HTML output, no `<script>` tags survive sanitization, links include `rel="noopener noreferrer"`.

---

### Task 4.4 — Create `RunningNotesViewer` component
**Complexity:** Small
**References:** TR.md Section 4.4, FRS.md FR-07

Create `apps/ui/src/components/SharedAgenda/RunningNotesViewer/RunningNotesViewer.tsx`:
- Props: `runningNotes: SharedAgendaResponse['running_notes']`
- Render six `RunningNotesSection` instances in the correct order (see FRS.md FR-07 for order)
- The section order is defined by a static `SECTIONS` constant — never dynamic
- Create `RunningNotesViewer.module.scss` with max-width column layout (max-width: 800px, centered, responsive padding, `@media print` overrides)
- Export via `index.ts`

**Verification:** Render with a full `running_notes` object — six sections appear in correct order. Verify section order matches: Completed Tasks, Incomplete Tasks, Relevant Deliverables, Recommendations, New Ideas, Next Steps.

---

### Task 4.5 — Create `PrintActions` component
**Complexity:** Small
**References:** TR.md Section 4.6, FRS.md FR-08

Create `apps/ui/src/components/SharedAgenda/PrintActions/PrintActions.tsx`:
- `'use client'` directive at top of file
- Two buttons: "Print" and "Download as PDF"
- Both call `window.print()` on click
- Create `PrintActions.module.scss`:
  - Normal view: flex row, styled buttons using `ui-tokens`
  - `@media print { display: none }` — buttons hidden in print output
- Export via `index.ts`

**Verification:**
- Clicking "Print" opens browser print dialog
- Clicking "Download as PDF" opens browser print dialog
- In print preview: neither button is visible
- Component is the only file with `"use client"` in this feature

---

## Phase 5: Assembly and Integration

### Task 5.1 — Assemble page with all components
**Complexity:** Small
**References:** TR.md Section 4.1, FRS.md FR-06, FR-07, FR-08

Wire up the full happy path in `SharedAgendaPage`:
```tsx
return (
  <PublicLayout>
    <AgendaHeader agenda={agenda} />
    <RunningNotesViewer runningNotes={agenda.running_notes} />
    <PrintActions />
  </PublicLayout>
)
```

Confirm all imports resolve, no TypeScript errors, no missing props.

**Verification:** Full page renders end-to-end with real API data — branded header, agenda header, all six sections with content, Print and Download buttons visible.

---

### Task 5.2 — Implement print styles end-to-end
**Complexity:** Medium
**References:** TR.md Section 5.2 (print media queries), FRS.md FR-09

Review and finalize all `@media print` styles across components:
- `PrintActions.module.scss`: `display: none` in print
- `RunningNotesSection.module.scss`: `page-break-inside: avoid`
- `RunningNotesViewer.module.scss`: remove max-width and padding for print
- `PublicLayout.module.scss`: retain logo/brand name, hide any action elements

Open Chrome print preview and validate:
- All six sections are fully visible
- No content truncated at page edges
- Buttons are absent
- iExcel branding appears at top
- Background is white, text is dark

**Verification:** Screenshot of print preview shared with team for sign-off.

---

## Phase 6: Responsive Design QA

### Task 6.1 — QA on mobile viewport (375px)
**Complexity:** Small
**References:** FRS.md FR-10, GS.md Scenario Group 6

Use browser dev tools responsive mode at 375px width:
- Confirm no horizontal scrollbar
- Confirm text is at least 16px base size
- Confirm Print/PDF buttons are visible and have adequate tap target size (44x44px minimum)
- Confirm all six sections are readable

Fix any overflow or sizing issues in SCSS.

**Verification:** Screenshots at 375px show clean, readable layout.

---

### Task 6.2 — QA on tablet and desktop viewports
**Complexity:** Small
**References:** FRS.md FR-10

- 768px: comfortable single column, no overflow
- 1440px: content is centered, max-width column is evident, generous whitespace on sides

**Verification:** Screenshots at 768px and 1440px show correct layout behavior.

---

## Phase 7: Testing

### Task 7.1 — Unit tests for `RunningNotesSection`
**Complexity:** Small
**References:** TR.md Section 11.1, GS.md Scenarios 1.3, 1.4

Test cases:
- Renders heading correctly
- Renders content when present
- Renders placeholder "Nothing to report for this period." when content is empty string
- Renders placeholder when content is null
- Renders placeholder when content is undefined

---

### Task 7.2 — Unit tests for `AgendaHeader`
**Complexity:** Small
**References:** TR.md Section 11.1

Test cases:
- Renders short ID
- Renders client name
- Renders formatted date range (not raw ISO strings)
- Renders finalized date (formatted)

---

### Task 7.3 — Unit tests for `SharedAgendaError`
**Complexity:** Small
**References:** TR.md Section 11.1, GS.md Scenario Groups 3–5

Test cases:
- `type="invalid"`: renders "This link is not valid" heading
- `type="expired"`: renders "This link has expired" heading
- `type="generic"`: renders "Something went wrong" heading
- Each type renders its specific body and guidance text

---

### Task 7.4 — Unit tests for date formatting utilities
**Complexity:** Small
**References:** TR.md Section 4.3

Test cases:
- `formatDateRange("2026-02-01", "2026-02-28")` → "February 1 – February 28, 2026" (or locale equivalent)
- `formatDate("2026-02-28T14:30:00Z")` → "February 28, 2026"
- Edge case: same month start/end, different years

---

### Task 7.5 — Integration tests for page error routing
**Complexity:** Medium
**References:** TR.md Section 11.2, FRS.md FR-05

Using a mocked `apiClient`:
- Mock returns `200` with sample data → assert `AgendaHeader` + `RunningNotesViewer` render
- Mock throws 404 error → assert `SharedAgendaError` with `type="invalid"` renders
- Mock throws 410 error → assert `SharedAgendaError` with `type="expired"` renders
- Mock throws 500 error → assert `SharedAgendaError` with `type="generic"` renders

---

### Task 7.6 — Accessibility audit
**Complexity:** Small
**References:** FRS.md FR-12, TR.md Section 11.4

Run `axe-core` against the rendered happy-path page:
- Confirm heading hierarchy: one `h1` (page title / client name), six `h2` (section headings)
- Confirm Print/Download buttons have accessible labels (`aria-label` if button text is insufficient)
- Confirm color contrast passes WCAG AA (4.5:1 body text, 3:1 large text)
- Fix any violations before marking feature complete

---

## Phase 8: Final Verification

### Task 8.1 — Full E2E test against staging API
**Complexity:** Small

With staging environment running:
- Navigate to a real shared agenda URL → full content renders correctly
- Navigate to an invalid token → correct error page
- Print → browser print dialog opens, output is clean
- Check page source → correct `<title>` tag, `noindex` robots meta

---

### Task 8.2 — Cross-browser smoke test
**Complexity:** Small

Verify the page renders correctly in:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)

Pay specific attention to print preview behavior in each browser.

---

### Task 8.3 — Security review
**Complexity:** Small
**References:** TR.md Section 6, Section 8

- Confirm `sanitize-html` is applied before any `dangerouslySetInnerHTML` usage
- Confirm no internal data fields are rendered (check API response type matches only `SharedAgendaResponse`)
- Confirm `/shared/*` is excluded from auth middleware
- Confirm `robots: noindex` is present on rendered pages

---

## Summary

| Phase | Tasks | Complexity |
|---|---|---|
| 1: Route and Layout | 1.1, 1.2, 1.3 | Small, Small, Small |
| 2: API Integration | 2.1, 2.2 | Small, Small |
| 3: Error Handling | 3.1, 3.2 | Small, Small |
| 4: Content Components | 4.1, 4.2, 4.3, 4.4, 4.5 | Small, Small, Medium, Small, Small |
| 5: Assembly | 5.1, 5.2 | Small, Medium |
| 6: Responsive QA | 6.1, 6.2 | Small, Small |
| 7: Testing | 7.1–7.6 | Small/Medium mix |
| 8: Final Verification | 8.1, 8.2, 8.3 | Small, Small, Small |

**Total estimated complexity:** 2 Medium tasks, remainder Small. This feature is straightforward to implement given that PublicLayout and the API client are already available. The critical path is: Task 1.1 → 1.2 → 2.1 → 4.3 (format decision) → 4.2 → 4.4 → 5.1 → 5.2.
