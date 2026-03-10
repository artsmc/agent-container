import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { DeviceAuthClient } from './DeviceAuthClient'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/get-token-action', () => ({
  getAccessTokenAction: vi.fn().mockResolvedValue('mock-jwt-token'),
}))

const mockFetch = vi.fn() as Mock
global.fetch = mockFetch

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSessionResponse(
  status: number,
  body: Record<string, unknown>
) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

function mockApproveResponse(
  status: number,
  body: Record<string, unknown>
) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

/** Render the form state and wait for it to be ready. */
async function renderWithPendingSession() {
  mockSessionResponse(200, {
    sessionId: 'abc123',
    status: 'pending',
    userCode: 'XK7M2P',
    expiresAt: '2026-03-10T00:00:00Z',
  })

  render(<DeviceAuthClient sessionId="abc123" userCode="XK7M2P" />)

  await waitFor(() => {
    expect(screen.getByTestId('device-form')).toBeInTheDocument()
  })
}

/** Click approve and wait for success state. */
async function approveAndWaitForSuccess(token = 'ixl_test_token') {
  mockApproveResponse(200, { token })
  fireEvent.click(screen.getByTestId('approve-button'))

  await waitFor(() => {
    expect(screen.getByTestId('device-success')).toBeInTheDocument()
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeviceAuthClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // Scenario: Missing session parameter shows error
  // -----------------------------------------------------------------------

  it('shows error when no session ID is provided', async () => {
    render(<DeviceAuthClient sessionId={null} userCode={null} />)

    await waitFor(() => {
      expect(screen.getByTestId('device-error')).toBeInTheDocument()
    })
    expect(screen.getByText(/no session id provided/i)).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Scenario: Expired session shows error
  // -----------------------------------------------------------------------

  it('shows error when session is expired', async () => {
    mockSessionResponse(200, {
      sessionId: 'abc123',
      status: 'expired',
      userCode: 'XK7M2P',
      expiresAt: '2026-01-01T00:00:00Z',
    })

    render(<DeviceAuthClient sessionId="abc123" userCode="XK7M2P" />)

    await waitFor(() => {
      expect(screen.getByTestId('device-error')).toBeInTheDocument()
    })
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Scenario: Already completed session shows error
  // -----------------------------------------------------------------------

  it('shows error when session is already completed', async () => {
    mockSessionResponse(200, {
      sessionId: 'abc123',
      status: 'completed',
      userCode: 'XK7M2P',
      expiresAt: '2026-03-10T00:00:00Z',
    })

    render(<DeviceAuthClient sessionId="abc123" userCode="XK7M2P" />)

    await waitFor(() => {
      expect(screen.getByTestId('device-error')).toBeInTheDocument()
    })
    expect(screen.getByText(/already been authorized/i)).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Scenario: Session not found (404) shows error
  // -----------------------------------------------------------------------

  it('shows error when session is not found', async () => {
    mockSessionResponse(404, {
      error: { code: 'SESSION_NOT_FOUND', message: 'Not found' },
    })

    render(<DeviceAuthClient sessionId="invalid" userCode="XK7M2P" />)

    await waitFor(() => {
      expect(screen.getByTestId('device-error')).toBeInTheDocument()
    })
    expect(screen.getByText(/session not found/i)).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Scenario: Valid session shows approval form
  // -----------------------------------------------------------------------

  it('shows approval form for a valid pending session', async () => {
    mockSessionResponse(200, {
      sessionId: 'abc123',
      status: 'pending',
      userCode: 'XK7M2P',
      expiresAt: '2026-03-10T00:00:00Z',
    })

    render(<DeviceAuthClient sessionId="abc123" userCode="XK7M2P" />)

    // First shows loading
    expect(screen.getByTestId('device-loading')).toBeInTheDocument()

    // Then shows the form
    await waitFor(() => {
      expect(screen.getByTestId('device-form')).toBeInTheDocument()
    })

    expect(screen.getByText('Authorize Device Access')).toBeInTheDocument()
    expect(screen.getByText('XK7M2P')).toBeInTheDocument()
    expect(screen.getByTestId('approve-button')).toBeInTheDocument()
    expect(screen.getByTestId('approve-button')).toHaveTextContent('Approve')
  })

  // -----------------------------------------------------------------------
  // Scenario: Successful approval shows token
  // -----------------------------------------------------------------------

  it('shows token after successful approval', async () => {
    await renderWithPendingSession()

    await approveAndWaitForSuccess('ixl_a8f3e9d2_test_token_value')

    expect(screen.getByText('Device Authorized')).toBeInTheDocument()
    expect(screen.getByTestId('token-value')).toHaveTextContent('ixl_a8f3e9d2_test_token_value')
    expect(screen.getByTestId('copy-button')).toBeInTheDocument()
    expect(screen.getByTestId('token-warning')).toHaveTextContent(
      /this token will only be shown once/i
    )
    expect(screen.getByTestId('done-button')).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Scenario: Copy button copies token and shows feedback
  // -----------------------------------------------------------------------

  it('copies token to clipboard and shows Copied! feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    await renderWithPendingSession()
    await approveAndWaitForSuccess('ixl_test_copy_token')

    // Click copy
    fireEvent.click(screen.getByTestId('copy-button'))

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('ixl_test_copy_token')
    })
    expect(screen.getByTestId('copy-button')).toHaveTextContent('Copied!')

    // Advance timers by 2 seconds to revert button text
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    await waitFor(() => {
      expect(screen.getByTestId('copy-button')).toHaveTextContent('Copy')
    })
  })

  // -----------------------------------------------------------------------
  // Scenario: Done button shows completion
  // -----------------------------------------------------------------------

  it('shows completion message when Done is clicked', async () => {
    await renderWithPendingSession()
    await approveAndWaitForSuccess('ixl_done_token')

    fireEvent.click(screen.getByTestId('done-button'))

    expect(screen.getByTestId('done-message')).toHaveTextContent(
      /close this tab/i
    )
    // Token should no longer be visible
    expect(screen.queryByTestId('token-value')).not.toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Scenario: Approve failure shows error
  // -----------------------------------------------------------------------

  it('shows error when approve request fails', async () => {
    await renderWithPendingSession()

    mockApproveResponse(410, {
      error: { code: 'SESSION_EXPIRED', message: 'Session expired' },
    })

    fireEvent.click(screen.getByTestId('approve-button'))

    await waitFor(() => {
      expect(screen.getByTestId('device-error')).toBeInTheDocument()
    })
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Scenario: Network error during validation
  // -----------------------------------------------------------------------

  it('shows error when network request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    render(<DeviceAuthClient sessionId="abc123" userCode="XK7M2P" />)

    await waitFor(() => {
      expect(screen.getByTestId('device-error')).toBeInTheDocument()
    })
    expect(screen.getByText(/unable to reach the server/i)).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Scenario: Approve sends correct request with auth header and label
  // -----------------------------------------------------------------------

  it('sends the correct approve request with auth header', async () => {
    await renderWithPendingSession()

    mockApproveResponse(200, { token: 'ixl_test' })

    // Fill in a label
    const labelInput = screen.getByLabelText(/label/i)
    fireEvent.change(labelInput, { target: { value: 'My Laptop' } })
    fireEvent.click(screen.getByTestId('approve-button'))

    await waitFor(() => {
      expect(screen.getByTestId('device-success')).toBeInTheDocument()
    })

    // Verify the approve call was made correctly
    const approveCall = mockFetch.mock.calls[1]
    expect(approveCall[0]).toContain('/auth/device/approve')
    expect(approveCall[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
    })

    const sentBody = JSON.parse(approveCall[1].body as string)
    expect(sentBody.sessionId).toBe('abc123')
    expect(sentBody.label).toBe('My Laptop')

    const headers = approveCall[1].headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer mock-jwt-token')
  })
})
