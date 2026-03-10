'use client'

/**
 * TasksSummaryTab -- Simplified Kanban: Draft → Approved.
 *
 * - Drag cards from Draft to Approved to approve them
 * - X button on card to remove (reject) a task
 * - Click card to open edit modal
 * - Approved tasks can later be bulk-pushed to Asana
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  useDroppable,
  useDraggable,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import type { NormalizedTask } from '@iexcel/shared-types'
import { useAllClientTasks } from '../hooks/useAllClientTasks'
import { Badge } from '@/components/Badge'
import type { BadgeProps } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import TaskEditPanel from './TaskEditPanel'
import { parseIsoDurationToMinutes } from '@/lib/dashboard/parseIsoDuration'
import { formatEstimatedTime } from '@/lib/dashboard/formatEstimatedTime'
import { getBrowserApiClient } from '@/lib/api-client-browser'
import styles from './TasksSummaryTab.module.scss'

interface TasksSummaryTabProps {
  clientId: string
  enabled: boolean
}

const COLUMNS: Array<{ key: string; label: string; badgeVariant: BadgeProps['variant'] }> = [
  { key: 'draft', label: 'Draft', badgeVariant: 'default' },
  { key: 'approved', label: 'Approved', badgeVariant: 'success' },
  { key: 'pushed', label: 'Pushed', badgeVariant: 'info' },
]

function field<T>(obj: Record<string, unknown>, camel: string, snake: string): T | undefined {
  return (obj[camel] ?? obj[snake]) as T | undefined
}

export default function TasksSummaryTab({ clientId, enabled }: TasksSummaryTabProps) {
  const { data, loading, error, refetch } = useAllClientTasks(clientId, enabled)
  const [selectedTask, setSelectedTask] = useState<NormalizedTask | null>(null)
  const [activeTask, setActiveTask] = useState<NormalizedTask | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const tasksByStatus = useMemo(() => {
    const groups: Record<string, NormalizedTask[]> = { draft: [], approved: [], pushed: [] }
    if (!data) return groups
    for (const t of data.data) {
      const s = t.status as string
      if (s in groups) groups[s].push(t)
    }
    return groups
  }, [data])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActionError(null)
    setActiveTask((event.active.data.current?.task as NormalizedTask) ?? null)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const fromStatus = active.data.current?.status as string
    const toStatus = over.id as string

    // Only allow draft → approved
    if (fromStatus === 'draft' && toStatus === 'approved') {
      try {
        const api = getBrowserApiClient()
        await api.approveTask(active.id as string)
        refetch()
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to approve task')
      }
    }
  }, [refetch])

  const handleRemoveTask = useCallback(async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setActionError(null)
    try {
      const api = getBrowserApiClient()
      await api.rejectTask(taskId, { reason: 'Removed from board' })
      refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove task')
    }
  }, [refetch])

  const handleCardClick = useCallback((task: NormalizedTask) => {
    setSelectedTask(task)
  }, [])

  const handleModalClose = useCallback(() => {
    setSelectedTask(null)
  }, [])

  const handleSaved = useCallback(() => {
    setSelectedTask(null)
    refetch()
  }, [refetch])

  if (loading) {
    return (
      <div className={styles.container} data-testid="tasks-tab-skeleton">
        <div className={styles.board}>
          {[0, 1].map((i) => (
            <div key={i} className={styles.skeletonColumn}>
              <div className={styles.skeletonHeader} />
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container} data-testid="tasks-tab-error">
        <p className={styles.errorMessage}>Failed to load tasks.</p>
        <Button variant="secondary" size="sm" onClick={refetch}>Retry</Button>
      </div>
    )
  }

  if (!data || data.data.length === 0) {
    return (
      <div className={styles.container} data-testid="tasks-tab-empty">
        <p className={styles.emptyMessage}>No tasks for this client yet.</p>
      </div>
    )
  }

  const activeStatus = activeTask ? (activeTask.status as string) : null

  return (
    <div className={styles.container} data-testid="tasks-tab">
      {actionError && (
        <div className={styles.actionError} data-testid="action-error">
          {actionError}
          <button
            className={styles.dismissError}
            onClick={() => setActionError(null)}
            type="button"
          >
            &times;
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.board} data-testid="kanban-board">
          {COLUMNS.map((col) => {
            const tasks = tasksByStatus[col.key] ?? []
            const isValidDrop = activeStatus === 'draft' && col.key === 'approved'

            return (
              <KanbanColumn
                key={col.key}
                id={col.key}
                label={col.label}
                badgeVariant={col.badgeVariant}
                count={tasks.length}
                isValidDrop={isValidDrop}
                isDragging={activeTask !== null}
              >
                {tasks.length === 0 ? (
                  <div className={styles.emptyColumn}>
                    {isValidDrop ? 'Drop here to approve' : 'No tasks'}
                  </div>
                ) : (
                  tasks.map((task) => {
                    const isPushed = task.status === 'pushed' || task.status === 'completed'
                    return isPushed ? (
                      <StaticTaskCard key={task.id} task={task} onClick={handleCardClick} />
                    ) : (
                      <DraggableTaskCard
                        key={task.id}
                        task={task}
                        onClick={handleCardClick}
                        onRemove={handleRemoveTask}
                        showRemove={task.status === 'draft'}
                      />
                    )
                  })
                )}
              </KanbanColumn>
            )
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? <TaskCardVisual task={activeTask} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <Modal
        open={selectedTask !== null}
        onClose={handleModalClose}
        title={
          selectedTask
            ? `${field<string>(selectedTask as unknown as Record<string, unknown>, 'shortId', 'short_id') ?? ''} — Edit Task`
            : 'Edit Task'
        }
        size="lg"
      >
        {selectedTask && (
          <TaskEditPanel
            task={selectedTask}
            onSaved={handleSaved}
            onClose={handleModalClose}
          />
        )}
      </Modal>
    </div>
  )
}

// ===== KanbanColumn =====

interface KanbanColumnProps {
  id: string
  label: string
  badgeVariant: BadgeProps['variant']
  count: number
  isValidDrop: boolean
  isDragging: boolean
  children: React.ReactNode
}

function KanbanColumn({
  id,
  label,
  badgeVariant,
  count,
  isValidDrop,
  isDragging,
  children,
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id })

  const cls = [
    styles.column,
    isDragging && isValidDrop ? styles.columnValidDrop : '',
    isOver && isValidDrop ? styles.columnActiveOver : '',
  ].filter(Boolean).join(' ')

  return (
    <div ref={setNodeRef} className={cls} data-testid={`kanban-column-${id}`}>
      <div className={styles.columnHeader}>
        <span className={styles.columnTitle}>{label}</span>
        <Badge variant={badgeVariant}>{count}</Badge>
      </div>
      <div className={styles.columnCards}>
        {children}
      </div>
    </div>
  )
}

// ===== StaticTaskCard (read-only, not draggable) =====

function StaticTaskCard({ task, onClick }: { task: NormalizedTask; onClick: (t: NormalizedTask) => void }) {
  return (
    <div
      className={styles.cardStatic}
      onClick={() => onClick(task)}
      data-testid="task-card"
      role="button"
      tabIndex={0}
    >
      <TaskCardVisual task={task} />
    </div>
  )
}

// ===== DraggableTaskCard =====

interface DraggableTaskCardProps {
  task: NormalizedTask
  onClick: (task: NormalizedTask) => void
  onRemove: (taskId: string, e: React.MouseEvent) => void
  showRemove: boolean
}

function DraggableTaskCard({ task, onClick, onRemove, showRemove }: DraggableTaskCardProps) {
  const status = task.status as string
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task, status },
  })

  const dragOccurredRef = useRef(false)

  useEffect(() => {
    if (isDragging) dragOccurredRef.current = true
  }, [isDragging])

  const handleClick = useCallback(() => {
    if (dragOccurredRef.current) {
      dragOccurredRef.current = false
      return
    }
    onClick(task)
  }, [onClick, task])

  return (
    <div
      ref={setNodeRef}
      className={`${styles.card} ${isDragging ? styles.cardDragging : ''}`}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      data-testid="task-card"
    >
      <TaskCardVisual task={task} onRemove={showRemove ? onRemove : undefined} />
    </div>
  )
}

// ===== TaskCardVisual =====

interface TaskCardVisualProps {
  task: NormalizedTask
  overlay?: boolean
  onRemove?: (taskId: string, e: React.MouseEvent) => void
}

function TaskCardVisual({ task, overlay, onRemove }: TaskCardVisualProps) {
  const raw = task as unknown as Record<string, unknown>
  const shortId = field<string>(raw, 'shortId', 'short_id') ?? ''
  const estimatedTimeIso = field<string>(raw, 'estimatedTime', 'estimated_time') ?? null
  const minutes = parseIsoDurationToMinutes(estimatedTimeIso)
  const timeDisplay = formatEstimatedTime(minutes)

  return (
    <div className={overlay ? `${styles.cardInner} ${styles.cardOverlay}` : styles.cardInner}>
      <div className={styles.cardTop}>
        <span className={styles.cardShortId}>{shortId}</span>
        {onRemove && (
          <button
            type="button"
            className={styles.cardRemoveBtn}
            onClick={(e) => onRemove(task.id, e)}
            aria-label={`Remove task ${shortId}`}
            title="Remove task"
          >
            &times;
          </button>
        )}
      </div>
      <div className={styles.cardTitle}>{task.title}</div>
      <div className={styles.cardMeta}>
        <span className={styles.cardAssignee}>{task.assignee ?? '--'}</span>
        {timeDisplay !== '\u2014' && (
          <span className={styles.cardTime}>{timeDisplay}</span>
        )}
      </div>
    </div>
  )
}
