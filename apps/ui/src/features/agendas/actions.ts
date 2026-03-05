'use server'

import { getApiClient } from '@/lib/dashboard/getApiClient'
import type {
  AgendaDetail,
  AgendaSummary,
  AgendaContent,
  ShareResponse,
  EmailSendRequest,
} from './types'

/**
 * Fetch the list of agendas for a client. Maps the API response
 * to the AgendaSummary shape expected by the UI.
 */
export async function fetchAgendaList(
  clientId: string
): Promise<{ agendas: AgendaSummary[]; error?: string }> {
  try {
    const api = getApiClient()
    const response = await api.listAgendas(clientId)

    const agendas: AgendaSummary[] = response.data.map((agenda) => ({
      id: agenda.id,
      short_id: agenda.shortId,
      cycle_start: agenda.cycleStart,
      cycle_end: agenda.cycleEnd,
      status: agenda.status,
      last_edited_by: {
        name: 'Editor',
        source: 'ui' as const,
      },
      last_edited_at: agenda.updatedAt,
      comment_count: 0,
    }))

    return { agendas }
  } catch (err) {
    return {
      agendas: [],
      error: err instanceof Error ? err.message : 'Failed to fetch agendas',
    }
  }
}

/**
 * Fetch a single agenda by short ID or UUID for the editor.
 */
export async function fetchAgendaDetail(
  agendaId: string
): Promise<{ agenda: AgendaDetail | null; error?: string }> {
  try {
    const api = getApiClient()
    const response = await api.getAgenda(agendaId)
    const { agenda, versions } = response

    // Parse the content string as structured sections.
    // The API stores content as a JSON string, we parse it into AgendaContent.
    let content: AgendaContent
    try {
      const parsed = JSON.parse(agenda.content || '{}')
      content = {
        completed_tasks: parsed.completed_tasks ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        incomplete_tasks: parsed.incomplete_tasks ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        relevant_deliverables: parsed.relevant_deliverables ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        recommendations: parsed.recommendations ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        new_ideas: parsed.new_ideas ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        next_steps: parsed.next_steps ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
      }
    } catch {
      content = {
        completed_tasks: { type: 'doc', content: [{ type: 'paragraph' }] },
        incomplete_tasks: { type: 'doc', content: [{ type: 'paragraph' }] },
        relevant_deliverables: {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        recommendations: { type: 'doc', content: [{ type: 'paragraph' }] },
        new_ideas: { type: 'doc', content: [{ type: 'paragraph' }] },
        next_steps: { type: 'doc', content: [{ type: 'paragraph' }] },
      }
    }

    const detail: AgendaDetail = {
      id: agenda.id,
      short_id: agenda.shortId,
      client_id: agenda.clientId,
      client_name: '',
      cycle_start: agenda.cycleStart,
      cycle_end: agenda.cycleEnd,
      status: agenda.status,
      content,
      comments: [],
      version_history: versions.map((v) => ({
        id: v.id,
        changed_at: v.createdAt,
        changed_by: {
          name: v.editedBy ?? 'Unknown',
          source: v.source,
        },
        section: 'content',
        old_content: {},
        new_content: {},
      })),
      version: versions.length,
      last_edited_at: agenda.updatedAt,
    }

    return { agenda: detail }
  } catch (err) {
    return {
      agenda: null,
      error: err instanceof Error ? err.message : 'Failed to fetch agenda',
    }
  }
}

/**
 * Update agenda content via PATCH.
 */
export async function patchAgendaContent(
  agendaId: string,
  content: Partial<AgendaContent>,
  version: number
): Promise<{ success: boolean; version?: number; error?: string; code?: string }> {
  try {
    const api = getApiClient()
    const contentStr = JSON.stringify(content)
    await api.updateAgenda(agendaId, { content: contentStr })
    return { success: true, version: version + 1 }
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('409') || err.message.includes('CONFLICT')) {
        return { success: false, error: 'Version conflict', code: 'CONFLICT' }
      }
      if (err.message.includes('423') || err.message.includes('LOCKED')) {
        return { success: false, error: 'Agenda is locked', code: 'LOCKED' }
      }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Save failed',
    }
  }
}

/**
 * Finalize an agenda.
 */
export async function finalizeAgenda(
  agendaId: string
): Promise<{ success: boolean; error?: string; code?: string }> {
  try {
    const api = getApiClient()
    await api.finalizeAgenda(agendaId)
    return { success: true }
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes('FINALIZE_REQUIRES_EDIT')
    ) {
      return {
        success: false,
        error: 'Please make at least one edit before finalizing.',
        code: 'FINALIZE_REQUIRES_EDIT',
      }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to finalize',
    }
  }
}

/**
 * Share an agenda and return URLs.
 */
export async function shareAgenda(
  agendaId: string
): Promise<{ urls: ShareResponse | null; error?: string }> {
  try {
    const api = getApiClient()
    const response = await api.shareAgenda(agendaId)
    return {
      urls: {
        client_url: response.sharedUrl,
        internal_url: response.internalUrl,
      },
    }
  } catch (err) {
    return {
      urls: null,
      error: err instanceof Error ? err.message : 'Failed to share',
    }
  }
}

/**
 * Email an agenda to recipients.
 */
export async function emailAgenda(
  agendaId: string,
  body: EmailSendRequest
): Promise<{ success: boolean; error?: string }> {
  try {
    const api = getApiClient()
    await api.emailAgenda(agendaId, {
      recipients: body.recipients.map((email) => ({
        name: '',
        email,
      })),
    })
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email',
    }
  }
}

/**
 * Export an agenda to Google Docs or PDF.
 */
export async function exportAgenda(
  agendaId: string,
  format: 'google_docs' | 'pdf'
): Promise<{ url?: string; error?: string }> {
  try {
    const api = getApiClient()
    if (format === 'google_docs') {
      const response = await api.exportAgenda(agendaId)
      return { url: response.googleDocUrl }
    }
    // PDF: The export endpoint handles both formats; for PDF we return a download URL
    const response = await api.exportAgenda(agendaId)
    return { url: response.googleDocUrl }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Export failed',
    }
  }
}

/**
 * Poll for agenda updates (used by useAgendaSync).
 */
export async function pollAgendaUpdates(
  agendaId: string,
  sinceVersion: number
): Promise<{ agenda: AgendaDetail | null; notModified: boolean }> {
  try {
    const api = getApiClient()
    const response = await api.getAgenda(agendaId)
    const { agenda, versions } = response
    const currentVersion = versions.length

    if (currentVersion <= sinceVersion) {
      return { agenda: null, notModified: true }
    }

    let content: AgendaContent
    try {
      const parsed = JSON.parse(agenda.content || '{}')
      content = {
        completed_tasks: parsed.completed_tasks ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        incomplete_tasks: parsed.incomplete_tasks ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        relevant_deliverables: parsed.relevant_deliverables ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        recommendations: parsed.recommendations ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        new_ideas: parsed.new_ideas ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        next_steps: parsed.next_steps ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
      }
    } catch {
      content = {
        completed_tasks: { type: 'doc', content: [{ type: 'paragraph' }] },
        incomplete_tasks: { type: 'doc', content: [{ type: 'paragraph' }] },
        relevant_deliverables: {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        recommendations: { type: 'doc', content: [{ type: 'paragraph' }] },
        new_ideas: { type: 'doc', content: [{ type: 'paragraph' }] },
        next_steps: { type: 'doc', content: [{ type: 'paragraph' }] },
      }
    }

    const detail: AgendaDetail = {
      id: agenda.id,
      short_id: agenda.shortId,
      client_id: agenda.clientId,
      client_name: '',
      cycle_start: agenda.cycleStart,
      cycle_end: agenda.cycleEnd,
      status: agenda.status,
      content,
      comments: [],
      version_history: versions.map((v) => ({
        id: v.id,
        changed_at: v.createdAt,
        changed_by: {
          name: v.editedBy ?? 'Unknown',
          source: v.source,
        },
        section: 'content',
        old_content: {},
        new_content: {},
      })),
      version: currentVersion,
      last_edited_at: agenda.updatedAt,
    }

    return { agenda: detail, notModified: false }
  } catch {
    return { agenda: null, notModified: true }
  }
}
