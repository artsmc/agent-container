import { notFound, redirect } from 'next/navigation'
import { getApiClient } from '@/lib/dashboard/getApiClient'
import { ApiClientError } from '@iexcel/api-client'
import type { Client } from '@iexcel/shared-types'
import ClientDetailPage from './ClientDetailPage'

interface PageProps {
  params: Promise<{ client_id: string }>
}

/**
 * Normalizes a client API response (snake_case) to the Client type (camelCase).
 * Handles both cases so the downstream components always get camelCase.
 */
function normalizeClient(raw: Record<string, unknown>): Client {
  return {
    id: (raw.id as string),
    name: (raw.name as string),
    grainPlaylistId: (raw.grainPlaylistId ?? raw.grain_playlist_id ?? null) as string | null,
    defaultAsanaWorkspaceId: (raw.defaultAsanaWorkspaceId ?? raw.default_asana_workspace_id ?? null) as string | null,
    defaultAsanaProjectId: (raw.defaultAsanaProjectId ?? raw.default_asana_project_id ?? null) as string | null,
    emailRecipients: (raw.emailRecipients ?? raw.email_recipients ?? []) as Client['emailRecipients'],
    createdAt: (raw.createdAt ?? raw.created_at ?? '') as string,
    updatedAt: (raw.updatedAt ?? raw.updated_at ?? '') as string,
  }
}

/**
 * Client detail page -- Server Component.
 *
 * Reads the client_id from route params, fetches the client
 * server-side via the api-client, and passes the resolved
 * Client object to the ClientDetailPage client component.
 *
 * Handles 404 (not found) and 5xx (generic error) states.
 */
export default async function ClientDetailPageRoute({ params }: PageProps) {
  const { client_id } = await params

  try {
    const apiClient = getApiClient()
    const raw = await apiClient.getClient(client_id)
    const client = normalizeClient(raw as unknown as Record<string, unknown>)

    return <ClientDetailPage client={client} />
  } catch (err) {
    if (err instanceof ApiClientError && err.statusCode === 404) {
      notFound()
    }

    if (err instanceof ApiClientError && err.statusCode === 401) {
      redirect('/login')
    }

    if (err instanceof ApiClientError && err.statusCode === 403) {
      return (
        <div style={{ padding: '2rem' }}>
          <h1>Access Denied</h1>
          <p>You do not have access to this client.</p>
        </div>
      )
    }

    // Re-throw to let Next.js error boundary handle 5xx
    throw err
  }
}
