# Feature 28: UI Agenda Editor -- Task Update Report

**Status:** Complete
**Date:** 2026-03-05

## Summary

Implemented the full UI Agenda Editor feature, consisting of two screens:

1. **Agenda List** (`/clients/{client_id}/agendas`) -- Card-based list of agendas with quick actions (Edit, Finalize, Share, Email)
2. **Agenda Editor** (`/agendas/{short_id}`) -- Full rich text editing experience with collaborative sync, internal comments, version history, and action bar

## Files Created/Modified

### New Feature Module (`apps/ui/src/features/agendas/`)
- `types.ts` -- AgendaSummary, AgendaDetail, AgendaContent, AgendaComment, AgendaVersionEntry, ActiveUser, SaveStatus, ShareResponse, UserRole types
- `utils.ts` -- formatCycleDates, formatRelativeTime, getStatusBadgeVariant, formatStatus, isAgendaReadOnly, canManageAgenda, proseMirrorToPlainText utilities
- `actions.ts` -- Server Actions wrapping API calls (fetchAgendaList, fetchAgendaDetail, patchAgendaContent, finalizeAgenda, shareAgenda, emailAgenda, exportAgenda, pollAgendaUpdates)
- `index.ts` -- Barrel exports

### Hooks (`apps/ui/src/features/agendas/hooks/`)
- `useAgendaList.ts` -- Fetches agenda list for a client
- `useAgendaDetail.ts` -- Fetches single agenda by short ID
- `useAgendaMutations.ts` -- Finalize, share, email, export mutations
- `useAgendaSync.ts` -- Polling-based collaborative sync (5s interval)
- `useAgendaComments.ts` -- Optimistic comment/reply management

### Components (`apps/ui/src/features/agendas/components/`)
- `AgendaListPage.tsx` + `.module.scss` -- List page with loading skeleton, error, empty states
- `AgendaEditorPage.tsx` + `.module.scss` -- Editor with CSS Grid layout, auto-save debounce (1500ms), section editing, modals
- `AgendaEditorHeader.tsx` + `.module.scss` -- Short ID, client name, cycle dates, status badge, auto-save indicator
- `AgendaSection.tsx` + `.module.scss` -- Section wrapper with h3 header and RichTextEditor
- `AgendaCard.tsx` + `.module.scss` -- Card for list screen with role/status-aware actions
- `CommentsPanel.tsx` + `.module.scss` -- Collapsible right sidebar with comment threads
- `CommentThread.tsx` + `.module.scss` -- Single comment with author, timestamp, reply support
- `VersionHistoryPanel.tsx` + `.module.scss` -- Collapsible panel with diff view (red/green)
- `ActionBar.tsx` + `.module.scss` -- Sticky bottom bar with Finalize, Share, Email, Export
- `ShareModal.tsx` + `.module.scss` -- Two URL rows with copy buttons
- `EmailModal.tsx` + `.module.scss` -- Recipients tag input, subject, preview, send
- `PresenceIndicator.tsx` + `.module.scss` -- Avatar chips for active users

### Enhanced Stubs
- `apps/ui/src/components/RichTextEditor/RichTextEditor.tsx` -- Full TipTap implementation with toolbar (bold, italic, underline, lists, h4, code, links), ProseMirror JSON I/O, readOnly support, onCommit callback, collaborative content sync
- `apps/ui/src/components/RichTextEditor/RichTextEditor.module.scss` -- Toolbar, active states, ProseMirror content styling
- `apps/ui/src/components/Modal/Modal.tsx` -- Portal rendering, focus trap, Escape key, size variants (sm/md/lg), footer slot
- `apps/ui/src/components/Modal/Modal.module.scss` -- Size variants, footer, close button

### Routes
- `apps/ui/src/app/(dashboard)/clients/[client_id]/agendas/page.tsx` -- Agenda list route
- `apps/ui/src/app/(dashboard)/agendas/[short_id]/page.tsx` -- Agenda editor route with 404 handling
- `apps/ui/src/app/(dashboard)/agendas/[short_id]/page.module.scss` -- Not-found state styles

### Dependencies Added
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `@tiptap/extension-placeholder`, `@tiptap/extension-link`, `@tiptap/extension-underline`

## Architecture Notes

- Server Actions pattern used for all API calls from client components (avoids httpOnly cookie cross-origin issues)
- ProseMirror JSON content stored as structured `AgendaContent` (6 section keys) mapped from the API's string content field
- Polling sync isolated in `useAgendaSync` hook for easy V2 WebSocket replacement
- Auto-save debounce accumulates changes across sections into a single PATCH request
- CSS Grid layout for three-column editor (content + comments + history) with transition support

## Reviewer Notes

- Pre-existing build errors exist in ClientCard, PendingApprovalsPanel (tokens namespace in mixins.scss) and auth-client (module resolution). These are not introduced by this feature.
- The shared-types `Agenda` type stores content as a plain string; the feature actions layer parses/serializes this as ProseMirror JSON.
- The `TagInput` component from Feature 26 was not available; the EmailModal implements its own simple tag-based recipient input.
