'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { GetTasksResponse } from '@iexcel/shared-types'
import { getBrowserApiClient } from '@/lib/api-client-browser'

/**
 * Fetches the 10 most recent tasks for a client.
 *
 * Only fires when `enabled` is true -- designed for lazy tab loading.
 * Returns cached data on subsequent renders without refetching.
 */
export function useClientTasks(clientId: string, enabled: boolean) {
  const [data, setData] = useState<GetTasksResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fetchCount, setFetchCount] = useState(0)
  const hasFetched = useRef(false)

  useEffect(() => {
    if (!enabled) return
    if (hasFetched.current && fetchCount === 0) return

    let cancelled = false
    hasFetched.current = true

    async function doFetch() {
      setLoading(true)
      setError(null)
      try {
        const apiClient = getBrowserApiClient()
        const response = await apiClient.listTasks(clientId, { limit: 10 })
        if (!cancelled) setData(response)
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

  const retry = useCallback(() => {
    hasFetched.current = false
    setFetchCount((c) => c + 1)
  }, [])

  return { data, loading, error, retry }
}
