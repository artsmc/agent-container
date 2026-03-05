import { notFound } from 'next/navigation'
import { getApiClient } from '@/lib/dashboard/getApiClient'
import { ApiClientError } from '@iexcel/api-client'
import ClientDetailPage from './ClientDetailPage'

interface PageProps {
  params: Promise<{ client_id: string }>
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
    const client = await apiClient.getClient(client_id)

    return <ClientDetailPage client={client} />
  } catch (err) {
    if (err instanceof ApiClientError && err.statusCode === 404) {
      notFound()
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
