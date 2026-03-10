'use client'

import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { getAccessTokenAction } from '@/lib/get-token-action'
import styles from './device-auth.module.scss'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState = 'loading' | 'form' | 'submitting' | 'success' | 'done' | 'error'

interface SessionValidationResponse {
  sessionId: string
  status: 'pending' | 'complete' | 'expired'
  userCode: string
  expiresAt: string
}

interface ApproveResponse {
  token: string
}

interface ApiErrorResponse {
  error?: { code?: string; message?: string }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatErrorMessage(status: number, body: ApiErrorResponse): string {
  const code = body.error?.code
  if (status === 410 || code === 'SESSION_EXPIRED') {
    return 'This session has expired. Please run the login command again in your terminal.'
  }
  if (status === 409 || code === 'SESSION_ALREADY_COMPLETED') {
    return 'This device has already been authorized. You can close this tab.'
  }
  if (status === 404 || code === 'SESSION_NOT_FOUND') {
    return 'Session not found. Please run the login command again in your terminal.'
  }
  return body.error?.message ?? 'An unexpected error occurred. Please try again.'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DeviceAuthClientProps {
  sessionId: string | null
  userCode: string | null
}

export function DeviceAuthClient({ sessionId, userCode }: DeviceAuthClientProps) {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [label, setLabel] = useState('')
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState(false)

  // -----------------------------------------------------------------------
  // Session validation on mount
  // -----------------------------------------------------------------------

  const validateSession = useCallback(async () => {
    if (!sessionId) {
      setErrorMessage('No session ID provided. Please use the link from your terminal.')
      setPageState('error')
      return
    }

    try {
      const res = await fetch(`${API_URL}/auth/device/session/${sessionId}`)

      if (!res.ok) {
        const body: ApiErrorResponse = await res.json().catch(() => ({}))
        setErrorMessage(formatErrorMessage(res.status, body))
        setPageState('error')
        return
      }

      const data: SessionValidationResponse = await res.json()

      if (data.status === 'expired') {
        setErrorMessage('This session has expired. Please run the login command again in your terminal.')
        setPageState('error')
        return
      }

      if (data.status === 'complete') {
        setErrorMessage('This device has already been authorized. You can close this tab.')
        setPageState('error')
        return
      }

      setPageState('form')
    } catch {
      setErrorMessage('Unable to reach the server. Please check your connection and try again.')
      setPageState('error')
    }
  }, [sessionId])

  useEffect(() => {
    void validateSession()
  }, [validateSession])

  // -----------------------------------------------------------------------
  // Approve handler
  // -----------------------------------------------------------------------

  const handleApprove = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!sessionId) return

    setPageState('submitting')

    try {
      const accessToken = await getAccessTokenAction()

      const body: Record<string, string> = { sessionId }
      if (label.trim()) {
        body.label = label.trim()
      }

      const res = await fetch(`${API_URL}/auth/device/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errorBody: ApiErrorResponse = await res.json().catch(() => ({}))
        setErrorMessage(formatErrorMessage(res.status, errorBody))
        setPageState('error')
        return
      }

      const data: ApproveResponse = await res.json()
      setToken(data.token)
      setPageState('success')
    } catch {
      setErrorMessage('Unable to reach the server. Please check your connection and try again.')
      setPageState('error')
    }
  }

  // -----------------------------------------------------------------------
  // Copy to clipboard
  // -----------------------------------------------------------------------

  const handleCopy = async () => {
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // -----------------------------------------------------------------------
  // Render: Loading
  // -----------------------------------------------------------------------

  if (pageState === 'loading') {
    return (
      <div className={styles.container} data-testid="device-loading">
        <div className={styles.card}>
          <p className={styles.loadingText}>Validating session...</p>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render: Error
  // -----------------------------------------------------------------------

  if (pageState === 'error') {
    return (
      <div className={styles.container} data-testid="device-error">
        <div className={styles.card}>
          <div className={styles.iconError} aria-hidden="true">!</div>
          <h1 className={styles.heading}>Authorization Error</h1>
          <p className={styles.errorText}>{errorMessage}</p>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render: Success (token display)
  // -----------------------------------------------------------------------

  if (pageState === 'success' || pageState === 'done') {
    return (
      <div className={styles.container} data-testid="device-success">
        <div className={styles.card}>
          <div className={styles.iconSuccess} aria-hidden="true">&#10003;</div>
          <h1 className={styles.heading}>Device Authorized</h1>

          {pageState === 'success' && (
            <>
              <div className={styles.tokenSection}>
                <label className={styles.tokenLabel}>Your API Token</label>
                <div className={styles.tokenBox}>
                  <code className={styles.tokenValue} data-testid="token-value">
                    {token}
                  </code>
                  <button
                    type="button"
                    className={`${styles.copyButton} ${copied ? styles.copyButtonCopied : ''}`}
                    onClick={handleCopy}
                    data-testid="copy-button"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <p className={styles.warningText} data-testid="token-warning">
                This token will only be shown once. Copy it now and store it securely.
              </p>

              <button
                type="button"
                className={styles.button}
                onClick={() => { setToken(''); setPageState('done'); }}
                data-testid="done-button"
              >
                Done
              </button>
            </>
          )}

          {pageState === 'done' && (
            <p className={styles.successText} data-testid="done-message">
              Setup complete. You can close this tab and return to your terminal.
            </p>
          )}
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render: Form (pageState === 'form' | 'submitting')
  // -----------------------------------------------------------------------

  const isSubmitting = pageState === 'submitting'

  return (
    <div className={styles.container} data-testid="device-form">
      <div className={styles.card}>
        <h1 className={styles.heading}>Authorize Device Access</h1>
        <p className={styles.subheading}>
          A device is requesting access to your account.
        </p>

        <div className={styles.codeDisplay} data-testid="user-code">
          <span className={styles.codeLabel}>Device code</span>
          <span className={styles.codeValue}>{userCode}</span>
        </div>

        <form onSubmit={handleApprove} className={styles.form}>
          <div className={styles.fieldGroup}>
            <label htmlFor="device-label" className={styles.label}>
              Label <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="device-label"
              type="text"
              className={styles.input}
              placeholder="e.g. Work Laptop Terminal"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={isSubmitting}
              maxLength={255}
            />
          </div>

          <button
            type="submit"
            className={styles.button}
            disabled={isSubmitting}
            data-testid="approve-button"
          >
            {isSubmitting ? 'Approving...' : 'Approve'}
          </button>
        </form>
      </div>
    </div>
  )
}
