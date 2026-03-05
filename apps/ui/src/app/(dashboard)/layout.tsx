import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createApiClient } from '@iexcel/api-client'
import { AuthProvider } from '@/auth/AuthProvider'
import type { AuthenticatedUser } from '@/auth/types'
import { decodeJwtPayload } from '@/auth/token-utils'
import { createCookieTokenProvider } from '@/auth/api-token-provider'
import { COOKIE_ACCESS_TOKEN } from '@/auth/cookies'
import { DashboardLayout } from '@/layouts/DashboardLayout'

/**
 * (dashboard) Route Group Layout — Server Component
 *
 * Runs after the auth proxy has validated the session. Responsibilities:
 * 1. Verify the access token cookie is still present (safety net).
 * 2. Decode identity claims (sub, email, name) from the JWT payload.
 * 3. Call GET /me to retrieve product-level permissions (role).
 * 4. Construct an AuthenticatedUser and pass it to AuthProvider.
 * 5. Wrap the dashboard UI shell around {children}.
 *
 * If any step fails, redirect to /login — the proxy should have caught
 * invalid tokens already, but this handles edge cases gracefully.
 */
export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(COOKIE_ACCESS_TOKEN)?.value

  if (!accessToken) {
    redirect('/login')
  }

  // Decode identity claims from the token payload — no re-verification needed
  // since the proxy already validated the session.
  const claims = decodeJwtPayload(accessToken)
  const sub = typeof claims?.sub === 'string' ? claims.sub : null
  const email = typeof claims?.email === 'string' ? claims.email : null
  const name = typeof claims?.name === 'string' ? claims.name : null

  if (!sub || !email || !name) {
    console.warn('[dashboard/layout] Access token is missing required claims')
    redirect('/login')
  }

  // Fetch product-level permissions from the API
  let role: AuthenticatedUser['role']
  let assignedClientIds: string[]

  try {
    const apiClient = createApiClient({
      baseUrl: process.env.API_BASE_URL ?? '',
      tokenProvider: createCookieTokenProvider(),
    })
    const response = await apiClient.getMe()
    // ProductUser.role is a UserRole enum value which maps to the same union
    role = response.user.role as AuthenticatedUser['role']
    // assignedClientIds will be added to the /me response in a future iteration.
    // Default to empty array until the API contract is updated.
    assignedClientIds = []
  } catch (err) {
    console.error('[dashboard/layout] GET /me failed:', err instanceof Error ? err.message : err)
    redirect('/login')
  }

  const user: AuthenticatedUser = {
    sub,
    email,
    name,
    role,
    assignedClientIds,
  }

  return (
    <AuthProvider user={user}>
      <DashboardLayout>{children}</DashboardLayout>
    </AuthProvider>
  )
}
