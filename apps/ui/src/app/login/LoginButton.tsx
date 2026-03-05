'use client'

import { startLogin } from './actions'
import styles from './login.module.scss'

/**
 * Login button that initiates the SSO authorization flow.
 *
 * Uses a form with a Server Action so the PKCE state is generated server-side
 * and the redirect to the auth service happens as a full browser navigation.
 * No token values are ever exposed to client-side JavaScript.
 */
export default function LoginButton() {
  return (
    <form action={startLogin} className={styles.form}>
      <button type="submit" className={styles.button}>
        Login with SSO
      </button>
    </form>
  )
}
