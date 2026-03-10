import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PublicLayout } from '@/layouts/PublicLayout'
import { DeviceAuthClient } from './DeviceAuthClient'

export const metadata: Metadata = {
  title: 'Authorize Device — iExcel',
}

interface DeviceAuthPageProps {
  searchParams: Promise<{ session?: string; code?: string }>
}

/**
 * /auth/device — Device authentication approval page.
 *
 * Users land here after running `iexcel login` in a terminal.
 * The URL contains a session ID and user code as query parameters.
 *
 * If the user is not logged in, they are redirected to /login with a
 * returnTo parameter so they come back here after authentication.
 */
export default async function DeviceAuthPage({ searchParams }: DeviceAuthPageProps) {
  const { session, code } = await searchParams
  const cookieStore = await cookies()

  if (!cookieStore.has('iexcel_access_token')) {
    const returnTo = buildReturnTo(session, code)
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
  }

  return (
    <PublicLayout>
      <DeviceAuthClient sessionId={session ?? null} userCode={code ?? null} />
    </PublicLayout>
  )
}

function buildReturnTo(session?: string, code?: string): string {
  const base = '/auth/device'
  const params = new URLSearchParams()
  if (session) params.set('session', session)
  if (code) params.set('code', code)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}
