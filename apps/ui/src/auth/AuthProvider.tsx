'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { AuthenticatedUser } from './types'

interface AuthContextValue {
  user: AuthenticatedUser
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  user: AuthenticatedUser
  children: ReactNode
}

/**
 * Provides the authenticated user to all client components within the
 * (dashboard) route group.
 *
 * The user data is passed down from the dashboard Server Component layout,
 * which sources it from the OIDC token + GET /me API. No client-side fetches
 * are made on mount.
 */
export function AuthProvider({ user, children }: AuthProviderProps) {
  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>
}

/**
 * Returns the authenticated user from the nearest AuthProvider.
 *
 * Throws a descriptive error if called outside of an AuthProvider — this
 * catches accidental usage in components rendered outside the dashboard
 * route group during development.
 *
 * @example
 * ```tsx
 * 'use client'
 * import { useAuth } from '@/auth/AuthProvider'
 *
 * export function UserAvatar() {
 *   const { user } = useAuth()
 *   return <Avatar name={user.name} email={user.email} />
 * }
 * ```
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
