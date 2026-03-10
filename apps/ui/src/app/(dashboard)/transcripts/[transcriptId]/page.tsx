import { notFound, redirect } from 'next/navigation'
import { getApiClient } from '@/lib/dashboard/getApiClient'
import { ApiClientError } from '@iexcel/api-client'
import type { Client } from '@iexcel/shared-types'
import TranscriptDetailClient from './TranscriptDetailClient'

interface PageProps {
  params: Promise<{ transcriptId: string }>
}

export default async function TranscriptDetailPage({ params }: PageProps) {
  const { transcriptId } = await params

  try {
    const apiClient = getApiClient()
    const [transcriptRaw, clientsRaw] = await Promise.all([
      apiClient.getTranscript(transcriptId),
      apiClient.listClients({ page: 1, limit: 200 }),
    ])

    const transcript = transcriptRaw as unknown as Record<string, unknown>
    const clientsResponse = clientsRaw as unknown as Record<string, unknown>
    const clients = ((clientsResponse.data ?? []) as Client[])

    return (
      <TranscriptDetailClient
        transcript={transcript}
        clients={clients}
      />
    )
  } catch (err) {
    if (err instanceof ApiClientError && err.statusCode === 404) {
      notFound()
    }
    if (err instanceof ApiClientError && err.statusCode === 401) {
      redirect('/login')
    }
    throw err
  }
}
