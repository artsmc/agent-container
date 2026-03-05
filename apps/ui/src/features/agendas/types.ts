import type { AgendaStatus } from '@iexcel/shared-types'

/**
 * Re-export AgendaStatus for convenience within the feature.
 */
export { AgendaStatus } from '@iexcel/shared-types'

/**
 * Summary representation of an agenda, used on the list screen.
 */
export interface AgendaSummary {
  id: string
  short_id: string
  cycle_start: string
  cycle_end: string
  status: AgendaStatus
  last_edited_by: {
    name: string
    source: 'agent' | 'ui' | 'terminal'
  }
  last_edited_at: string
  comment_count: number
}

/**
 * ProseMirror JSON document object. Using Record<string, unknown> to
 * represent the flexible ProseMirror JSON shape without resorting to `any`.
 */
export type ProseMirrorDoc = Record<string, unknown>

/**
 * Structured content for an agenda's Running Notes sections.
 * Each field stores a ProseMirror JSON document.
 */
export interface AgendaContent {
  completed_tasks: ProseMirrorDoc
  incomplete_tasks: ProseMirrorDoc
  relevant_deliverables: ProseMirrorDoc
  recommendations: ProseMirrorDoc
  new_ideas: ProseMirrorDoc
  next_steps: ProseMirrorDoc
}

/**
 * Section key constants for the six Running Notes sections.
 */
export const AGENDA_SECTIONS: { label: string; key: keyof AgendaContent }[] = [
  { label: 'Completed Tasks', key: 'completed_tasks' },
  { label: 'Incomplete Tasks', key: 'incomplete_tasks' },
  { label: 'Relevant Deliverables', key: 'relevant_deliverables' },
  { label: 'Recommendations', key: 'recommendations' },
  { label: 'New Ideas', key: 'new_ideas' },
  { label: 'Next Steps', key: 'next_steps' },
]

/**
 * Reply to an internal comment.
 */
export interface AgendaCommentReply {
  id: string
  author: { id: string; name: string; initials: string }
  text: string
  created_at: string
}

/**
 * An internal comment on an agenda.
 */
export interface AgendaComment {
  id: string
  author: { id: string; name: string; initials: string }
  text: string
  created_at: string
  replies: AgendaCommentReply[]
}

/**
 * A single entry in the version history.
 */
export interface AgendaVersionEntry {
  id: string
  changed_at: string
  changed_by: {
    name: string
    source: 'agent' | 'ui' | 'terminal'
  }
  section: string
  old_content: ProseMirrorDoc
  new_content: ProseMirrorDoc
}

/**
 * Active user for presence indicators.
 */
export interface ActiveUser {
  id: string
  name: string
  initials: string
}

/**
 * Full agenda object used by the editor.
 */
export interface AgendaDetail {
  id: string
  short_id: string
  client_id: string
  client_name: string
  cycle_start: string
  cycle_end: string
  status: AgendaStatus
  content: AgendaContent
  comments: AgendaComment[]
  version_history: AgendaVersionEntry[]
  version: number
  last_edited_at: string
  active_users?: ActiveUser[]
  default_recipients?: string[]
}

/**
 * Save status for the auto-save indicator.
 */
export type SaveStatus = 'saved' | 'saving' | 'failed' | 'unsaved'

/**
 * Share response from the API.
 */
export interface ShareResponse {
  client_url: string
  internal_url: string
}

/**
 * Email send request body.
 */
export interface EmailSendRequest {
  recipients: string[]
  subject: string
}

/**
 * User role type for permission checks.
 */
export type UserRole = 'admin' | 'account_manager' | 'team_member'
