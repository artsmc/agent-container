import type { Metadata } from 'next';
import { ApiClientError } from '@iexcel/api-client';
import { AgendaHeader } from '@/components/SharedAgenda/AgendaHeader';
import { RunningNotesViewer } from '@/components/SharedAgenda/RunningNotesViewer';
import { PrintActions } from '@/components/SharedAgenda/PrintActions';
import { SharedAgendaError } from '@/components/SharedAgenda/SharedAgendaError';
import { createPublicApiClient } from '@/lib/api-client-public';
import { formatDateRange } from '@/lib/dates';

/**
 * Fetch shared agenda data. Separated into a function so it can be
 * reused by both generateMetadata and the page component.
 * React's request-level deduplication ensures a single API call per request.
 */
async function fetchSharedAgenda(token: string) {
  const apiClient = createPublicApiClient();
  return apiClient.getSharedAgenda(token);
}

/**
 * Generate dynamic metadata for the shared agenda page.
 * Sets a descriptive title and noindex/nofollow robots directive
 * to keep shared agendas out of search engine indexes.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;

  try {
    const agenda = await fetchSharedAgenda(token);
    return {
      title: `${agenda.client_name} \u2014 Agenda ${agenda.short_id} | iExcel`,
      description: `Shared agenda for ${agenda.client_name}, covering ${formatDateRange(agenda.cycle_start, agenda.cycle_end)}.`,
      robots: { index: false, follow: false },
    };
  } catch {
    return {
      title: 'Agenda | iExcel',
      robots: { index: false, follow: false },
    };
  }
}

/**
 * SharedAgendaPage -- Public page for viewing a finalized shared agenda.
 *
 * This is an async Server Component. It fetches agenda data server-side
 * and renders the full page before sending HTML to the client. No
 * authentication is required -- the share token in the URL is the sole
 * access credential.
 *
 * Error handling:
 * - 404 -> "This link is not valid" (token not found or revoked)
 * - 410 -> "This link has expired" (token past expiry)
 * - All other errors -> "Something went wrong"
 *
 * NOTE: /shared/[token] must remain outside any auth middleware.
 */
export default async function SharedAgendaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  try {
    const agenda = await fetchSharedAgenda(token);

    return (
      <div data-testid="shared-agenda-page">
        <AgendaHeader agenda={agenda} />
        <RunningNotesViewer runningNotes={agenda.running_notes} />
        <PrintActions />
      </div>
    );
  } catch (error: unknown) {
    if (error instanceof ApiClientError) {
      if (error.statusCode === 404) {
        return <SharedAgendaError type="invalid" />;
      }
      if (error.statusCode === 410) {
        return <SharedAgendaError type="expired" />;
      }
    }

    return <SharedAgendaError type="generic" />;
  }
}
