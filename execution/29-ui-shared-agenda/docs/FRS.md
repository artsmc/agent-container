# FRS — Functional Requirement Specification
## Feature 29: UI Shared Agenda (Client View)

**Version:** 1.0
**Date:** 2026-03-03

---

## 1. Page Architecture

### FR-01: Route Definition

The shared agenda page must be registered at the Next.js App Router path `app/shared/[token]/page.tsx`. The `[token]` segment is a dynamic route parameter that captures the full opaque share token from the URL.

**Acceptance Criteria:**
- Navigating to `/shared/abc123` resolves to the shared agenda page with `token = "abc123"`
- No other segment structure is valid — `/shared/` (no token) returns 404
- The route is accessible without any authentication middleware

### FR-02: Layout Wrapper

The page must use `PublicLayout` (from `apps/ui/src/layouts/PublicLayout.tsx`). It must not use `DashboardLayout`. PublicLayout provides:
- iExcel branded header (logo, brand name)
- No sidebar
- No navigation links to internal screens
- No user account menu
- No authentication UI elements

**Acceptance Criteria:**
- `PublicLayout` is imported and wraps all page content
- No DashboardLayout components appear anywhere in the rendered output
- The layout renders correctly in isolation (no dependency on auth state)

### FR-03: Server-Side Rendering

The page component (`app/shared/[token]/page.tsx`) must be an `async` Server Component. Data fetching occurs on the server using the `api-client` package before the page is rendered and sent to the client.

**Rationale:** The content is read-only and static once finalized. SSR ensures fast first paint, correct SEO metadata, and no client-side loading spinners for public viewers.

**Acceptance Criteria:**
- No `"use client"` directive on the page component itself
- API call to `GET /shared/{token}` completes server-side before HTML is sent
- Page HTML contains rendered agenda content (not empty shells populated by client JS)

---

## 2. Data Fetching

### FR-04: API Call

The page must call `GET /shared/{token}` via the `api-client` package to retrieve the shared agenda data. The token is taken directly from the route `params`.

```typescript
// Pseudocode — actual method name determined by api-client package
const agenda = await apiClient.shared.getByToken(token)
```

**Response shape (from API spec):**
```typescript
interface SharedAgendaResponse {
  agenda_id: string
  short_id: string          // e.g. "AGD-0015"
  client_name: string
  cycle_start: string       // ISO date
  cycle_end: string         // ISO date
  finalized_at: string      // ISO datetime
  running_notes: {
    completed_tasks: object         // ProseMirror JSON document
    incomplete_tasks: object
    relevant_deliverables: object
    recommendations: object
    new_ideas: object
    next_steps: object
  }
  token_expires_at: string | null   // ISO datetime or null if no expiry
}
```

**Acceptance Criteria:**
- API call uses the `api-client` package — no raw `fetch()` calls to the API URL
- The token from the URL param is passed directly to the API call
- No auth headers are sent — this is a public endpoint

### FR-05: Error State Handling

All API error states must be caught and routed to appropriate UI. The page must handle:

| HTTP Status | Meaning | UI Response |
|---|---|---|
| `200 OK` | Valid token, finalized agenda | Render agenda content |
| `404 Not Found` | Token does not exist or was revoked | Render "Invalid Link" error page |
| `410 Gone` | Token has expired | Render "Link Expired" error page |
| `403 Forbidden` | Agenda not finalized (should not occur in practice) | Render generic error page |
| Network error / 5xx | Server unavailable | Render generic "Something went wrong" error page |

**Acceptance Criteria:**
- Each error state renders a distinct, branded error page within `PublicLayout`
- No raw error messages, stack traces, or JSON are ever shown to the client
- Error pages include a human-readable explanation and guidance (e.g. "Contact your account manager")

---

## 3. Page Content

### FR-06: Page Header

The content area (below PublicLayout's branded header) must display:
- **Agenda identifier:** Short ID (e.g. `AGD-0015`)
- **Client name:** The name of the client this agenda belongs to
- **Cycle period:** The date range (e.g. "February 1 – February 28, 2026")
- **Finalized date:** Displayed as "Finalized on [date]" in a secondary style

**Acceptance Criteria:**
- All four data points render when returned by the API
- Dates are formatted in a human-readable locale format (not raw ISO strings)
- The header is visually distinct from the body content sections

### FR-07: Running Notes Sections

The finalized Running Notes must be displayed in six ordered sections. Each section has a heading and formatted body content.

| Order | Section Heading | Data Field |
|---|---|---|
| 1 | Completed Tasks | `running_notes.completed_tasks` |
| 2 | Incomplete Tasks | `running_notes.incomplete_tasks` |
| 3 | Relevant Deliverables | `running_notes.relevant_deliverables` |
| 4 | Recommendations | `running_notes.recommendations` |
| 5 | New Ideas | `running_notes.new_ideas` |
| 6 | Next Steps | `running_notes.next_steps` |

**Content rendering rules:**
- Content is stored as ProseMirror JSON (the native format of the TipTap editor used in feature 28). For the public shared view, ProseMirror JSON must be rendered to HTML server-side before sending to the client. Use a ProseMirror JSON-to-HTML serializer (e.g., `@tiptap/html` or a custom server-side renderer) to convert the document to sanitized HTML for display.
- Preserve formatting: bullet lists, bold, italic, numbered lists must render correctly.
- Empty sections: if a section's content is empty or null, the section heading is still displayed with a placeholder ("Nothing to report for this period.") so clients are not confused by missing sections.

**Acceptance Criteria:**
- All six sections render in the specified order
- Section headings are visually consistent (same heading level and style)
- Rich text content renders with correct formatting (lists, emphasis, etc.)
- Empty sections display a placeholder, not a blank area
- No editing controls, toolbars, or cursor indicators appear on the content

### FR-08: Print and PDF Actions

The page must provide two action affordances:

**Print:**
- A "Print" button triggers `window.print()` in the browser
- The button is a Client Component (requires browser API)
- On click, the browser native print dialog opens

**Download as PDF:**
- A "Download as PDF" button triggers browser print-to-PDF via `window.print()`
- This is the same mechanism as Print — the distinction is in button labeling and user intent
- Print CSS (`@media print`) styles the output correctly for PDF export

**Acceptance Criteria:**
- Both buttons are visible in the normal (screen) view
- Both buttons are hidden in `@media print` styles (they must not appear in the printed/PDF output)
- The print layout correctly renders the full agenda content without truncation
- Page breaks in print view fall between sections where possible, not mid-content

### FR-09: Print Layout Optimization

`@media print` styles must:
- Hide the Print and Download buttons
- Hide the PublicLayout branded header's navigation/action elements (retain branding)
- Set `font-size` appropriate for print (11–12pt base)
- Remove background colors that waste ink (use white background, dark text)
- Ensure all six Running Notes sections are fully visible — no overflow clipping
- Set `page-break-inside: avoid` on individual content sections where possible

**Acceptance Criteria:**
- Print preview in Chrome/Firefox/Safari shows all content
- No sections are cut off at page boundaries
- Print output is clean and professional without browser UI artifacts

---

## 4. Layout and Visual Design

### FR-10: Responsive Layout

The page must be readable and usable on the following viewport widths:

| Breakpoint | Width | Behavior |
|---|---|---|
| Mobile | 375px–767px | Single column, full width content, slightly reduced padding |
| Tablet | 768px–1023px | Single column with comfortable margins |
| Desktop | 1024px+ | Centered content column, max-width ~800px for readability |

**Acceptance Criteria:**
- No horizontal scrollbar on any listed viewport width
- Text is readable (min 16px base on mobile)
- Print/PDF buttons are accessible on mobile (not hidden or too small to tap)

### FR-11: Branding

The PublicLayout header must display:
- iExcel logo (SVG asset from `apps/ui/src/assets/`)
- Brand name "iExcel" in brand typography
- No internal navigation links
- No user menu or login prompts

The content area uses the standard iExcel design token palette from `packages/ui-tokens/`. There is no custom client theming in V1.

**Acceptance Criteria:**
- iExcel logo renders in the header
- Design tokens (`_colors.scss`, `_typography.scss`, etc.) are applied via SCSS modules
- No hardcoded hex values or font names in component SCSS — all values come from tokens

### FR-12: Accessibility

- All heading levels are semantically correct (`h1` for page title, `h2` for section headings, etc.)
- All interactive elements (Print/PDF buttons) are keyboard-accessible and have visible focus states
- Color contrast meets WCAG AA minimum (4.5:1 for body text, 3:1 for large text)
- The page renders meaningfully without JavaScript (SSR ensures base content is always present)

---

## 5. Error Pages

### FR-13: Invalid Link Error Page

Displayed when the API returns `404` for the token.

**Content:**
- iExcel branded header (PublicLayout)
- Heading: "This link is not valid"
- Body: "The agenda link you followed could not be found. It may have been removed or the URL may be incorrect."
- Guidance: "If you believe this is an error, please contact your account manager."
- No links or CTAs that lead to internal screens

### FR-14: Expired Link Error Page

Displayed when the API returns `410` for the token.

**Content:**
- iExcel branded header (PublicLayout)
- Heading: "This link has expired"
- Body: "The agenda link you followed is no longer active."
- Guidance: "Please contact your account manager to request an updated link."

### FR-15: Generic Error Page

Displayed for all other error conditions (5xx, network failure, unexpected states).

**Content:**
- iExcel branded header (PublicLayout)
- Heading: "Something went wrong"
- Body: "We were unable to load this agenda. Please try again in a few moments."
- Guidance: "If the problem persists, please contact your account manager."

---

## 6. SEO and Metadata

### FR-16: Page Metadata

The page must export a `generateMetadata` function that returns dynamic metadata based on the agenda content.

```typescript
export async function generateMetadata({ params }) {
  // Fetch agenda (can reuse cached result from page component)
  // Return metadata based on content
  return {
    title: `${clientName} — Agenda ${shortId} | iExcel`,
    description: `Shared agenda for ${clientName}, covering ${cycleStart} to ${cycleEnd}.`,
    robots: 'noindex, nofollow',  // Shared agendas are not for public indexing
  }
}
```

**Acceptance Criteria:**
- `<title>` tag is set dynamically using agenda data
- `robots: noindex, nofollow` is set — shared agendas must not be indexed by search engines
- Error pages return appropriate 404/410 HTTP status codes (handled by Next.js `notFound()`)

---

## 7. Component Breakdown

### FR-17: New Components Required

| Component | Location | Type | Purpose |
|---|---|---|---|
| `SharedAgendaPage` | `app/shared/[token]/page.tsx` | Server Component | Route entry, data fetch, error routing |
| `AgendaHeader` | `components/SharedAgenda/AgendaHeader.tsx` | Server Component | Displays short ID, client name, cycle dates, finalized date |
| `RunningNotesViewer` | `components/SharedAgenda/RunningNotesViewer.tsx` | Server Component | Renders all six Running Notes sections |
| `RunningNotesSection` | `components/SharedAgenda/RunningNotesSection.tsx` | Server Component | Individual section with heading and formatted content |
| `PrintActions` | `components/SharedAgenda/PrintActions.tsx` | Client Component | Print and Download PDF buttons (requires `window.print()`) |
| `SharedAgendaError` | `components/SharedAgenda/SharedAgendaError.tsx` | Server Component | Reusable error display within PublicLayout |

### FR-18: Existing Components/Layouts to Reuse

| Asset | Source Feature | Usage |
|---|---|---|
| `PublicLayout.tsx` | Feature 23 (ui-scaffolding) | Wraps all page content |
| `PublicLayout.module.scss` | Feature 23 (ui-scaffolding) | Layout styles |
| `ui-tokens` package | Feature 23 (ui-scaffolding) | All design tokens via SCSS imports |
| `api-client` package | Feature 22 (api-client-package) | `shared.getByToken(token)` call |
