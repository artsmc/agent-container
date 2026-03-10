import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreateClientButton } from './CreateClientButton'

// Mock next/navigation
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// Mock the API client
vi.mock('@/lib/api-client-browser', () => ({
  getBrowserApiClient: () => ({
    createClient: vi.fn().mockResolvedValue({ id: '1', name: 'Test' }),
  }),
}))

// Mock createPortal so the modal renders inline during tests
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  }
})

describe('CreateClientButton', () => {
  it('renders the "New Client" button', () => {
    render(<CreateClientButton />)
    expect(screen.getByTestId('new-client-button')).toBeInTheDocument()
    expect(screen.getByTestId('new-client-button')).toHaveTextContent(
      '+ New Client'
    )
  })

  it('opens the modal when the button is clicked', () => {
    render(<CreateClientButton />)
    expect(screen.queryByText('New Client')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('new-client-button'))

    // The modal title "New Client" should now be visible
    // (the button text is "+ New Client" while the modal title is "New Client")
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes the modal when Cancel is clicked', () => {
    render(<CreateClientButton />)
    fireEvent.click(screen.getByTestId('new-client-button'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
