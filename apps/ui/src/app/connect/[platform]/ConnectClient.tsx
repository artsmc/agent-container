'use client'

import { useEffect, useState, useCallback, type FormEvent } from 'react'
import styles from './connect.module.scss'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const SUPPORTED_PLATFORMS = ['fireflies', 'grain'] as const
type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number]

const PLATFORM_CONFIG: Record<
  SupportedPlatform,
  { displayName: string; credentialField: string; credentialLabel: string; credentialKey: string }
> = {
  fireflies: {
    displayName: 'Fireflies',
    credentialField: 'apiKey',
    credentialLabel: 'API Key',
    credentialKey: 'apiKey',
  },
  grain: {
    displayName: 'Grain',
    credentialField: 'authorizationCode',
    credentialLabel: 'Authorization Code',
    credentialKey: 'authorizationCode',
  },
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState = 'loading' | 'form' | 'submitting' | 'success' | 'error'

interface SessionValidationResponse {
  sessionId: string
  platform: string
  status: 'pending' | 'completed' | 'expired'
  expiresAt: string
}

interface ApiErrorResponse {
  error?: { code?: string; message?: string }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSupportedPlatform(value: string): value is SupportedPlatform {
  return (SUPPORTED_PLATFORMS as readonly string[]).includes(value)
}

function formatErrorMessage(status: number, body: ApiErrorResponse): string {
  const code = body.error?.code
  if (status === 410 || code === 'SESSION_EXPIRED') {
    return 'This session has expired. Please request a new connection link from the agent.'
  }
  if (status === 409 || code === 'SESSION_ALREADY_COMPLETED') {
    return 'This integration has already been connected. You can close this tab.'
  }
  if (status === 404 || code === 'SESSION_NOT_FOUND') {
    return 'Session not found. Please request a new connection link from the agent.'
  }
  return body.error?.message ?? 'An unexpected error occurred. Please try again.'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ConnectClientProps {
  platform: string
  sessionId: string | null
}

export function ConnectClient({ platform, sessionId }: ConnectClientProps) {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [credential, setCredential] = useState('')
  const [label, setLabel] = useState('')

  // -----------------------------------------------------------------------
  // Session validation on mount
  // -----------------------------------------------------------------------

  const validateSession = useCallback(async () => {
    if (!sessionId) {
      setErrorMessage('No session ID provided. Please use the link from your conversation.')
      setPageState('error')
      return
    }

    if (!isSupportedPlatform(platform)) {
      setErrorMessage(`Unsupported platform: "${platform}". Supported platforms are Fireflies and Grain.`)
      setPageState('error')
      return
    }

    try {
      const res = await fetch(`${API_URL}/connect/${platform}/session/${sessionId}`)

      if (!res.ok) {
        const body: ApiErrorResponse = await res.json().catch(() => ({}))
        setErrorMessage(formatErrorMessage(res.status, body))
        setPageState('error')
        return
      }

      const data: SessionValidationResponse = await res.json()

      if (data.status === 'expired') {
        setErrorMessage('This session has expired. Please request a new connection link from the agent.')
        setPageState('error')
        return
      }

      if (data.status === 'completed') {
        setErrorMessage('This integration has already been connected. You can close this tab.')
        setPageState('error')
        return
      }

      setPageState('form')
    } catch {
      setErrorMessage('Unable to reach the server. Please check your connection and try again.')
      setPageState('error')
    }
  }, [platform, sessionId])

  useEffect(() => {
    void validateSession()
  }, [validateSession])

  // -----------------------------------------------------------------------
  // Form submission
  // -----------------------------------------------------------------------

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!sessionId || !isSupportedPlatform(platform)) return

    const config = PLATFORM_CONFIG[platform]
    if (!credential.trim()) return

    setPageState('submitting')

    try {
      const body: Record<string, string> = {
        sessionId,
        [config.credentialKey]: credential.trim(),
      }
      if (label.trim()) {
        body.label = label.trim()
      }

      const res = await fetch(`${API_URL}/connect/${platform}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errorBody: ApiErrorResponse = await res.json().catch(() => ({}))
        setErrorMessage(formatErrorMessage(res.status, errorBody))
        setPageState('error')
        return
      }

      setPageState('success')
    } catch {
      setErrorMessage('Unable to reach the server. Please check your connection and try again.')
      setPageState('error')
    }
  }

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  if (pageState === 'loading') {
    return (
      <div className={styles.container} data-testid="connect-loading">
        <div className={styles.card}>
          <p className={styles.loadingText}>Validating session...</p>
        </div>
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div className={styles.container} data-testid="connect-error">
        <div className={styles.card}>
          <div className={styles.iconError} aria-hidden="true">!</div>
          <h1 className={styles.heading}>Connection Error</h1>
          <p className={styles.errorText}>{errorMessage}</p>
        </div>
      </div>
    )
  }

  if (pageState === 'success') {
    return (
      <div className={styles.container} data-testid="connect-success">
        <div className={styles.card}>
          <div className={styles.iconSuccess} aria-hidden="true">&#10003;</div>
          <h1 className={styles.heading}>Connected</h1>
          <p className={styles.successText}>
            Integration connected! You can close this tab and return to your conversation.
          </p>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Form state (pageState === 'form' | 'submitting')
  // -----------------------------------------------------------------------

  const config = isSupportedPlatform(platform) ? PLATFORM_CONFIG[platform] : null
  if (!config) return null

  const isSubmitting = pageState === 'submitting'

  return (
    <div className={styles.container} data-testid="connect-form">
      <div className={styles.card}>
        <h1 className={styles.heading}>Connect {config.displayName}</h1>
        <p className={styles.subheading}>
          Enter your {config.displayName} credentials to complete the integration.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.fieldGroup}>
            <label htmlFor="label" className={styles.label}>
              Label <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="label"
              type="text"
              className={styles.input}
              placeholder={`e.g. My ${config.displayName} Account`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={isSubmitting}
              maxLength={255}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="credential" className={styles.label}>
              {config.credentialLabel}
            </label>
            <input
              id="credential"
              type="password"
              className={styles.input}
              placeholder={`Enter your ${config.credentialLabel.toLowerCase()}`}
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              disabled={isSubmitting}
              required
              autoFocus
            />
          </div>

          <button
            type="submit"
            className={styles.button}
            disabled={isSubmitting || !credential.trim()}
          >
            {isSubmitting ? 'Connecting...' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  )
}
