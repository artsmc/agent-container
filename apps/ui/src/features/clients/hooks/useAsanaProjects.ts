'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AsanaProject } from '../types'

/**
 * Fetches Asana projects for a given workspace.
 *
 * Refetches when `workspaceId` changes. Returns empty when
 * workspaceId is null (no workspace selected).
 *
 * Note: The api-client does not expose a `listAsanaProjects` method.
 * This hook uses a direct fetch to the API endpoint:
 *   GET /asana/workspaces/{workspace_id}/projects
 */
export function useAsanaProjects(workspaceId: string | null) {
  const [data, setData] = useState<AsanaProject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchProjects = useCallback(async (wsId: string) => {
    setLoading(true)
    setError(null)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''
      const response = await fetch(
        `${baseUrl}/asana/workspaces/${wsId}/projects`,
        {
          headers: { 'Accept': 'application/json' },
          credentials: 'include',
        }
      )
      if (!response.ok) {
        throw new Error(`Failed to load projects (${response.status})`)
      }
      const projects: AsanaProject[] = await response.json()
      setData(projects)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load projects'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!workspaceId) {
      setData([])
      return
    }
    fetchProjects(workspaceId)
  }, [workspaceId, fetchProjects])

  return { data, loading, error }
}
