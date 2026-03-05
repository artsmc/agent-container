// Feature 28: UI Agenda Editor -- barrel exports

// Types
export type {
  AgendaSummary,
  AgendaDetail,
  AgendaContent,
  AgendaComment,
  AgendaCommentReply,
  AgendaVersionEntry,
  ActiveUser,
  SaveStatus,
  ShareResponse,
  EmailSendRequest,
  UserRole,
  ProseMirrorDoc,
} from './types'

export { AgendaStatus, AGENDA_SECTIONS } from './types'

// Hooks
export { useAgendaList } from './hooks/useAgendaList'
export { useAgendaDetail } from './hooks/useAgendaDetail'
export { useAgendaMutations } from './hooks/useAgendaMutations'
export { useAgendaSync } from './hooks/useAgendaSync'
export { useAgendaComments } from './hooks/useAgendaComments'

// Components
export { AgendaListPage } from './components/AgendaListPage'
export { AgendaEditorPage } from './components/AgendaEditorPage'
export { AgendaCard } from './components/AgendaCard'
export { AgendaEditorHeader } from './components/AgendaEditorHeader'
export { AgendaSection } from './components/AgendaSection'
export { CommentsPanel } from './components/CommentsPanel'
export { CommentThread } from './components/CommentThread'
export { VersionHistoryPanel } from './components/VersionHistoryPanel'
export { ActionBar } from './components/ActionBar'
export { ShareModal } from './components/ShareModal'
export { EmailModal } from './components/EmailModal'
export { PresenceIndicator } from './components/PresenceIndicator'
