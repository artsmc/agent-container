import type { Metadata } from 'next'
import { PublicLayout } from '@/layouts/PublicLayout'
import { ConnectClient } from './ConnectClient'

export const metadata: Metadata = {
  title: 'Connect Integration — iExcel',
}

interface ConnectPageProps {
  params: Promise<{ platform: string }>
  searchParams: Promise<{ session?: string }>
}

/**
 * Public connect page — completes an integration credential session.
 *
 * Accessed via a link the agent sends in chat. No authentication is required;
 * the session ID in the query string acts as a time-limited bearer token
 * (sessions expire in 5 minutes).
 *
 * URL format: /connect/:platform?session=<uuid>
 */
export default async function ConnectPage({ params, searchParams }: ConnectPageProps) {
  const { platform } = await params
  const { session } = await searchParams

  return (
    <PublicLayout>
      <ConnectClient platform={platform} sessionId={session ?? null} />
    </PublicLayout>
  )
}
