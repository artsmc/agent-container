'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AgendaSummary } from '../types'
import { fetchAgendaList } from '../actions'

interface UseAgendaListReturn {
  agendas: AgendaSummary[]
  loading: boolean
  error: string | null
  retry: () => void
}

/**
 * Hook to fetch and manage the agenda list for a given client.
 */
export function useAgendaList(clientId: string): UseAgendaListReturn {
  const [agendas, setAgendas] = useState<AgendaSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAgendas = useCallback(async () => {
    setLoading(true)
    setError(null)

    const result = await fetchAgendaList(clientId)

    if (result.error) {
      setError(result.error)
    } else {
      setAgendas(result.agendas)
    }

    setLoading(false)
  }, [clientId])

  useEffect(() => {
    loadAgendas()
  }, [loadAgendas])

  return { agendas, loading, error, retry: loadAgendas }
}
