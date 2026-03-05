import type { Metadata } from 'next'
import Link from 'next/link'
import { PublicLayout } from '@/layouts/PublicLayout'
import styles from './error.module.scss'

export const metadata: Metadata = {
  title: 'Authentication Error — iExcel',
}

interface AuthErrorPageProps {
  searchParams: Promise<{ message?: string }>
}

/**
 * /auth/error — Authentication error display page.
 *
 * Renders a user-friendly error message when the auth flow fails.
 * The message comes from the `?message=` query parameter, which is set
 * by the callback handler. Raw auth service error details are never
 * surfaced to the user — only sanitised messages are passed.
 *
 * Includes a "Try again" link back to /login so the user can retry.
 */
export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const params = await searchParams
  const message = params.message ?? 'An unexpected authentication error occurred.'

  return (
    <PublicLayout>
      <div className={styles.container}>
        <h1 className={styles.heading}>Authentication Failed</h1>
        <p className={styles.message}>{message}</p>
        <Link href="/login" className={styles.link}>
          Try again
        </Link>
      </div>
    </PublicLayout>
  )
}
