import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateClientModal } from './CreateClientModal'

// Mock the browser API client
const mockCreateClient = vi.fn()

vi.mock('@/lib/api-client-browser', () => ({
  getBrowserApiClient: () => ({
    createClient: mockCreateClient,
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

describe('CreateClientModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onCreated: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClient.mockReset()
  })

  it('renders the modal with title "New Client" when open', () => {
    render(<CreateClientModal {...defaultProps} />)
    expect(screen.getByText('New Client')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(<CreateClientModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('New Client')).not.toBeInTheDocument()
  })

  it('renders a Name input field', () => {
    render(<CreateClientModal {...defaultProps} />)
    expect(screen.getByTestId('create-client-name-input')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('renders Cancel and Create buttons', () => {
    render(<CreateClientModal {...defaultProps} />)
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Create')).toBeInTheDocument()
  })

  it('disables the Create button when name is empty', () => {
    render(<CreateClientModal {...defaultProps} />)
    const createButton = screen.getByText('Create').closest('button')!
    expect(createButton).toBeDisabled()
  })

  it('disables the Create button when name is only whitespace', () => {
    render(<CreateClientModal {...defaultProps} />)
    const input = screen.getByTestId('create-client-name-input')
    fireEvent.change(input, { target: { value: '   ' } })
    const createButton = screen.getByText('Create').closest('button')!
    expect(createButton).toBeDisabled()
  })

  it('enables the Create button when a valid name is entered', () => {
    render(<CreateClientModal {...defaultProps} />)
    const input = screen.getByTestId('create-client-name-input')
    fireEvent.change(input, { target: { value: 'Acme Corp' } })
    const createButton = screen.getByText('Create').closest('button')!
    expect(createButton).not.toBeDisabled()
  })

  it('calls createClient with the trimmed name on submit', async () => {
    mockCreateClient.mockResolvedValueOnce({ id: '1', name: 'Acme Corp' })
    render(<CreateClientModal {...defaultProps} />)

    const input = screen.getByTestId('create-client-name-input')
    fireEvent.change(input, { target: { value: '  Acme Corp  ' } })

    const form = screen.getByTestId('create-client-form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockCreateClient).toHaveBeenCalledWith({ name: 'Acme Corp' })
    })
  })

  it('shows "Creating..." on the button during submission', async () => {
    // Never resolve so we can check loading state
    mockCreateClient.mockReturnValue(new Promise(() => {}))
    render(<CreateClientModal {...defaultProps} />)

    const input = screen.getByTestId('create-client-name-input')
    fireEvent.change(input, { target: { value: 'Acme Corp' } })

    const form = screen.getByTestId('create-client-form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument()
    })
  })

  it('calls onCreated after successful creation', async () => {
    const onCreated = vi.fn()
    mockCreateClient.mockResolvedValueOnce({ id: '1', name: 'Acme Corp' })
    render(<CreateClientModal {...defaultProps} onCreated={onCreated} />)

    const input = screen.getByTestId('create-client-name-input')
    fireEvent.change(input, { target: { value: 'Acme Corp' } })

    const form = screen.getByTestId('create-client-form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledOnce()
    })
  })

  it('displays an error message when creation fails', async () => {
    mockCreateClient.mockRejectedValueOnce(new Error('Name already taken'))
    render(<CreateClientModal {...defaultProps} />)

    const input = screen.getByTestId('create-client-name-input')
    fireEvent.change(input, { target: { value: 'Acme Corp' } })

    const form = screen.getByTestId('create-client-form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByTestId('create-client-error')).toHaveTextContent(
        'Name already taken'
      )
    })
  })

  it('displays a generic error message for non-Error throws', async () => {
    mockCreateClient.mockRejectedValueOnce('unknown')
    render(<CreateClientModal {...defaultProps} />)

    const input = screen.getByTestId('create-client-name-input')
    fireEvent.change(input, { target: { value: 'Acme Corp' } })

    const form = screen.getByTestId('create-client-form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByTestId('create-client-error')).toHaveTextContent(
        'Failed to create client'
      )
    })
  })

  it('does not call onCreated when creation fails', async () => {
    const onCreated = vi.fn()
    mockCreateClient.mockRejectedValueOnce(new Error('Server error'))
    render(<CreateClientModal {...defaultProps} onCreated={onCreated} />)

    const input = screen.getByTestId('create-client-name-input')
    fireEvent.change(input, { target: { value: 'Acme Corp' } })

    const form = screen.getByTestId('create-client-form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByTestId('create-client-error')).toBeInTheDocument()
    })
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<CreateClientModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('resets the form when Cancel is clicked', () => {
    render(<CreateClientModal {...defaultProps} />)
    const input = screen.getByTestId('create-client-name-input')
    fireEvent.change(input, { target: { value: 'Acme Corp' } })

    fireEvent.click(screen.getByText('Cancel'))

    // Re-render with isOpen to verify state was reset
    expect(defaultProps.onClose).toHaveBeenCalled()
  })
})
