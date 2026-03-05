import type {
  Agenda,
  PaginationParams,
  GetAgendasResponse,
  GetAgendaResponse,
  CreateAgendaRequest,
  UpdateAgendaRequest,
  ShareAgendaResponse,
  EmailAgendaRequest,
  ExportAgendaResponse,
} from '@iexcel/shared-types';
import type { HttpTransport } from '../core/http';

/**
 * Agenda endpoint methods.
 * All agenda methods accept either a UUID or short ID (e.g., AGD-0015)
 * as the agendaId parameter. The API resolves short IDs transparently.
 */
export function createAgendaEndpoints(http: HttpTransport) {
  return {
    /**
     * List agendas for a client with optional pagination.
     * GET /clients/{id}/agendas
     */
    listAgendas(
      clientId: string,
      params?: PaginationParams
    ): Promise<GetAgendasResponse> {
      return http.request({
        method: 'GET',
        path: `/clients/${clientId}/agendas`,
        params: params as Record<string, string | number | boolean | undefined | null>,
      });
    },

    /**
     * Create a new agenda for a client.
     * POST /clients/{id}/agendas
     */
    createAgenda(
      clientId: string,
      body: CreateAgendaRequest
    ): Promise<Agenda> {
      return http.request({
        method: 'POST',
        path: `/clients/${clientId}/agendas`,
        body,
      });
    },

    /**
     * Get a single agenda by UUID or short ID. Includes version history.
     * GET /agendas/{id}
     */
    getAgenda(agendaId: string): Promise<GetAgendaResponse> {
      return http.request({ method: 'GET', path: `/agendas/${agendaId}` });
    },

    /**
     * Update an agenda's content or cycle dates.
     * PATCH /agendas/{id}
     */
    updateAgenda(agendaId: string, body: UpdateAgendaRequest): Promise<Agenda> {
      return http.request({
        method: 'PATCH',
        path: `/agendas/${agendaId}`,
        body,
      });
    },

    /**
     * Finalize an agenda, preventing further edits.
     * POST /agendas/{id}/finalize
     */
    finalizeAgenda(agendaId: string): Promise<Agenda> {
      return http.request({
        method: 'POST',
        path: `/agendas/${agendaId}/finalize`,
      });
    },

    /**
     * Generate a shareable link for an agenda.
     * POST /agendas/{id}/share
     */
    shareAgenda(agendaId: string): Promise<ShareAgendaResponse> {
      return http.request({
        method: 'POST',
        path: `/agendas/${agendaId}/share`,
      });
    },

    /**
     * Email an agenda to recipients. Uses client defaults if no body provided.
     * POST /agendas/{id}/email
     */
    emailAgenda(agendaId: string, body?: EmailAgendaRequest): Promise<void> {
      return http.request({
        method: 'POST',
        path: `/agendas/${agendaId}/email`,
        body,
      });
    },

    /**
     * Export an agenda to Google Docs.
     * POST /agendas/{id}/export
     */
    exportAgenda(agendaId: string): Promise<ExportAgendaResponse> {
      return http.request({
        method: 'POST',
        path: `/agendas/${agendaId}/export`,
      });
    },

    /**
     * Get a shared agenda by its share token. This is a public endpoint
     * that does not require authentication.
     * GET /shared/{token}
     */
    getSharedAgenda(shareToken: string): Promise<Agenda> {
      return http.request({
        method: 'GET',
        path: `/shared/${shareToken}`,
        skipAuth: true,
      });
    },
  };
}

export type AgendaEndpoints = ReturnType<typeof createAgendaEndpoints>;
