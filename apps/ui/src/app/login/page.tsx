import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PublicLayout } from '@/layouts/PublicLayout'
import LoginButton from './LoginButton'
import styles from './login.module.scss'

export const metadata: Metadata = {
  title: 'Login — iExcel',
}

/**
 * Login page — accessible to unauthenticated users only.
 *
 * If the user already has a valid session cookie, they are immediately
 * redirected to the dashboard. Otherwise they see the "Login with SSO" button
 * which initiates the PKCE authorization code flow via a Server Action.
 *
 * This page uses PublicLayout and is excluded from the auth proxy matcher,
 * so it is never intercepted and redirected back to itself.
 */
export default async function LoginPage() {
  const cookieStore = await cookies()
  if (cookieStore.has('iexcel_access_token')) {
    redirect('/')
  }

  return (
    <PublicLayout>
      <div className={styles.container}>
        <h1 className={styles.heading}>Welcome to iExcel</h1>
        <p className={styles.subheading}>Sign in to your account to continue.</p>
        <LoginButton />
      </div>
    </PublicLayout>
  )
}
