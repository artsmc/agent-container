'use client'

import { useState, useEffect, useCallback } from 'react'
import type { GetTasksResponse } from '@iexcel/shared-types'
import { getBrowserApiClient } from '@/lib/api-client-browser'

/**
 * Fetches ALL tasks for a client (up to 100) across all statuses.
 * Designed for the Kanban board view that needs the full picture.
 *
 * Only fires when `enabled` is true -- designed for lazy tab loading.
 */
export function useAllClientTasks(clientId: string, enabled: boolean) {
  const [data, setData] = useState<GetTasksResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fetchCount, setFetchCount] = useState(0)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    async function doFetch() {
      setLoading(true)
      setError(null)
      try {
        const apiClient = getBrowserApiClient()
        const response = await apiClient.listTasks(clientId, { limit: 100 })
        if (!cancelled) {
          setData(response)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load tasks'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    doFetch()
    return () => { cancelled = true }
  }, [clientId, enabled, fetchCount])

  const refetch = useCallback(() => {
    setFetchCount((c) => c + 1)
  }, [])

  return { data, loading, error, refetch }
}
