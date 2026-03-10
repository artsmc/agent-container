import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import TasksSummaryTab from './TasksSummaryTab'
import type { NormalizedTask, GetTasksResponse } from '@iexcel/shared-types'
import { TaskStatus, TaskPriority } from '@iexcel/shared-types'

// ---- Mocks ----

const mockListTasks = vi.fn()
const mockUpdateTask = vi.fn()
const mockApproveTask = vi.fn()
const mockRejectTask = vi.fn()
const mockPushTask = vi.fn()

vi.mock('@/lib/api-client-browser', () => ({
  getBrowserApiClient: () => ({
    listTasks: mockListTasks,
    updateTask: mockUpdateTask,
    approveTask: mockApproveTask,
    rejectTask: mockRejectTask,
    pushTask: mockPushTask,
  }),
}))

// ---- Fixtures ----

function makeTask(overrides: Partial<NormalizedTask> & { id: string }): NormalizedTask {
  return {
    shortId: 'TSK-0001' as NormalizedTask['shortId'],
    clientId: 'client-1',
    transcriptId: null,
    status: TaskStatus.Draft,
    title: 'Test Task',
    description: {
      taskContext: 'context',
      additionalContext: 'additional',
      requirements: ['req1'],
    },
    assignee: null,
    priority: TaskPriority.Medium,
    estimatedTime: null,
    dueDate: null,
    scrumStage: 'backlog',
    tags: [],
    externalRef: null,
    approvedBy: null,
    approvedAt: null,
    pushedAt: null,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

const DRAFT_TASK = makeTask({
  id: 't1',
  shortId: 'TSK-0001' as NormalizedTask['shortId'],
  status: TaskStatus.Draft,
  title: 'Draft Task One',
  assignee: 'Alice',
  estimatedTime: 'PT2H30M',
})

const APPROVED_TASK = makeTask({
  id: 't2',
  shortId: 'TSK-0002' as NormalizedTask['shortId'],
  status: TaskStatus.Approved,
  title: 'Approved Task',
  assignee: 'Bob',
})

const REJECTED_TASK = makeTask({
  id: 't3',
  shortId: 'TSK-0003' as NormalizedTask['shortId'],
  status: TaskStatus.Rejected,
  title: 'Rejected Task',
})

const PUSHED_TASK = makeTask({
  id: 't4',
  shortId: 'TSK-0004' as NormalizedTask['shortId'],
  status: TaskStatus.Pushed,
  title: 'Pushed Task',
  estimatedTime: 'PT1H',
})

const ALL_TASKS: NormalizedTask[] = [DRAFT_TASK, APPROVED_TASK, REJECTED_TASK, PUSHED_TASK]

function makeResponse(tasks: NormalizedTask[]): GetTasksResponse {
  return {
    data: tasks,
    total: tasks.length,
    page: 1,
    limit: 100,
    hasMore: false,
  }
}

// ---- Test suites ----

describe('TasksSummaryTab (Kanban Board)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Scenario: Loading state
  describe('Given the Kanban board is loading data', () => {
    it('Then skeleton placeholders are shown', () => {
      mockListTasks.mockReturnValue(new Promise(() => {})) // never resolves
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)
      expect(screen.getByTestId('tasks-tab-skeleton')).toBeInTheDocument()
    })
  })

  // Scenario: Error state
  describe('Given the API request fails', () => {
    it('Then an error message and retry button are shown', async () => {
      mockListTasks.mockRejectedValueOnce(new Error('Network error'))
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByTestId('tasks-tab-error')).toBeInTheDocument()
      })
      expect(screen.getByText('Failed to load tasks.')).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })
  })

  // Scenario: Empty state
  describe('Given the client has no tasks', () => {
    it('Then a "No tasks" message is shown', async () => {
      mockListTasks.mockResolvedValueOnce(makeResponse([]))
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByTestId('tasks-tab-empty')).toBeInTheDocument()
      })
      expect(screen.getByText('No tasks for this client yet.')).toBeInTheDocument()
    })
  })

  // Scenario: Display Kanban columns with task counts
  describe('Given the client has tasks in various statuses', () => {
    beforeEach(() => {
      mockListTasks.mockResolvedValue(makeResponse(ALL_TASKS))
    })

    it('When the board loads, four columns are visible', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByTestId('kanban-board')).toBeInTheDocument()
      })

      expect(screen.getByTestId('kanban-column-draft')).toBeInTheDocument()
      expect(screen.getByTestId('kanban-column-approved')).toBeInTheDocument()
      expect(screen.getByTestId('kanban-column-rejected')).toBeInTheDocument()
      expect(screen.getByTestId('kanban-column-pushed')).toBeInTheDocument()
    })

    it('Each column header shows a badge with the count', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByTestId('kanban-board')).toBeInTheDocument()
      })

      // Each column has exactly 1 task in our fixture
      const columns = ['draft', 'approved', 'rejected', 'pushed']
      for (const col of columns) {
        const colEl = screen.getByTestId(`kanban-column-${col}`)
        const badges = within(colEl).getAllByTestId('badge')
        // First badge in the header is the count badge
        expect(badges[0]).toHaveTextContent('1')
      }
    })
  })

  // Scenario: Display task cards in correct columns
  describe('Given the Kanban board is displayed with tasks', () => {
    beforeEach(() => {
      mockListTasks.mockResolvedValue(makeResponse(ALL_TASKS))
    })

    it('Each task card appears in its corresponding status column', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByTestId('kanban-board')).toBeInTheDocument()
      })

      expect(within(screen.getByTestId('kanban-column-draft')).getByText('Draft Task One')).toBeInTheDocument()
      expect(within(screen.getByTestId('kanban-column-approved')).getByText('Approved Task')).toBeInTheDocument()
      expect(within(screen.getByTestId('kanban-column-rejected')).getByText('Rejected Task')).toBeInTheDocument()
      expect(within(screen.getByTestId('kanban-column-pushed')).getByText('Pushed Task')).toBeInTheDocument()
    })

    it('Each card shows the short ID', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByText('TSK-0001')).toBeInTheDocument()
      })
      expect(screen.getByText('TSK-0002')).toBeInTheDocument()
      expect(screen.getByText('TSK-0003')).toBeInTheDocument()
      expect(screen.getByText('TSK-0004')).toBeInTheDocument()
    })

    it('Each card shows the assignee if set', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument()
      })
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })

    it('Each card shows estimated time formatted when set', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        // DRAFT_TASK has PT2H30M -> "2h 30m"
        expect(screen.getByText('2h 30m')).toBeInTheDocument()
      })
      // PUSHED_TASK has PT1H -> "1h"
      expect(screen.getByText('1h')).toBeInTheDocument()
    })
  })

  // Scenario: Open task edit panel
  describe('When the user clicks a task card', () => {
    beforeEach(() => {
      mockListTasks.mockResolvedValue(makeResponse(ALL_TASKS))
    })

    it('A SlideOver edit panel opens with editable fields', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByText('Draft Task One')).toBeInTheDocument()
      })

      // Click the draft task card
      fireEvent.click(screen.getByLabelText('Edit task TSK-0001: Draft Task One'))

      // SlideOver should open with edit panel
      expect(screen.getByTestId('slide-over')).toBeInTheDocument()
      expect(screen.getByTestId('task-edit-panel')).toBeInTheDocument()

      // Title field should be populated
      const titleInput = screen.getByTestId('task-title-input') as HTMLInputElement
      expect(titleInput.value).toBe('Draft Task One')
    })
  })

  // Scenario: Approve a draft task
  describe('When Approve is clicked on a draft task', () => {
    beforeEach(() => {
      mockListTasks.mockResolvedValue(makeResponse(ALL_TASKS))
      mockApproveTask.mockResolvedValue(DRAFT_TASK)
    })

    it('Approve and Reject buttons are visible; Approve calls the API', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByText('Draft Task One')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Edit task TSK-0001: Draft Task One'))

      // Approve and Reject buttons should be visible
      expect(screen.getByText('Approve')).toBeInTheDocument()
      expect(screen.getByText('Reject')).toBeInTheDocument()

      // Click Approve
      fireEvent.click(screen.getByText('Approve'))

      await waitFor(() => {
        expect(mockApproveTask).toHaveBeenCalledWith('t1')
      })
    })
  })

  // Scenario: Reject a draft task
  describe('When Reject is clicked on a draft task', () => {
    beforeEach(() => {
      mockListTasks.mockResolvedValue(makeResponse(ALL_TASKS))
      mockRejectTask.mockResolvedValue(DRAFT_TASK)
    })

    it('Reject calls the reject API', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByText('Draft Task One')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Edit task TSK-0001: Draft Task One'))
      fireEvent.click(screen.getByText('Reject'))

      await waitFor(() => {
        expect(mockRejectTask).toHaveBeenCalledWith('t1')
      })
    })
  })

  // Scenario: Push an approved task
  describe('When Push is clicked on an approved task', () => {
    beforeEach(() => {
      mockListTasks.mockResolvedValue(makeResponse(ALL_TASKS))
      mockPushTask.mockResolvedValue(APPROVED_TASK)
    })

    it('Push button is visible; clicking it calls the push API', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByText('Approved Task')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Edit task TSK-0002: Approved Task'))

      // Push button should be visible
      expect(screen.getByText('Push')).toBeInTheDocument()
      // Approve/Reject should NOT be visible for approved tasks
      expect(screen.queryByText('Approve')).not.toBeInTheDocument()

      fireEvent.click(screen.getByText('Push'))

      await waitFor(() => {
        expect(mockPushTask).toHaveBeenCalledWith('t2')
      })
    })
  })

  // Scenario: Save task edits
  describe('When the user saves edits', () => {
    beforeEach(() => {
      mockListTasks.mockResolvedValue(makeResponse(ALL_TASKS))
      mockUpdateTask.mockResolvedValue(DRAFT_TASK)
    })

    it('Clicking Save calls updateTask with the edited values', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByText('Draft Task One')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Edit task TSK-0001: Draft Task One'))

      // Change the title
      const titleInput = screen.getByTestId('task-title-input')
      fireEvent.change(titleInput, { target: { value: 'Updated Title' } })

      // Click Save
      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith('t1', expect.objectContaining({
          title: 'Updated Title',
        }))
      })
    })
  })

  // Scenario: Close the edit panel
  describe('When the user closes the edit panel', () => {
    beforeEach(() => {
      mockListTasks.mockResolvedValue(makeResponse(ALL_TASKS))
    })

    it('Clicking the close button closes the panel', async () => {
      render(<TasksSummaryTab clientId="client-1" enabled={true} />)

      await waitFor(() => {
        expect(screen.getByText('Draft Task One')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Edit task TSK-0001: Draft Task One'))
      expect(screen.getByTestId('slide-over')).toBeInTheDocument()

      // Click the close button on the SlideOver
      fireEvent.click(screen.getByTestId('slide-over-close'))

      expect(screen.queryByTestId('slide-over')).not.toBeInTheDocument()
    })
  })
})
