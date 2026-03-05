'use client'

/**
 * ClientDetailPage -- Client component shell for the client detail view.
 *
 * Manages tab state via URL search params and lazy-loads tab content.
 * Implements dirty-state guard for the Settings tab.
 */

import { useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { Client } from '@iexcel/shared-types'
import { ClientHeader } from '@/components/ClientHeader'
import { TabNav, TabPanel } from '@/components/TabNav'
import type { TabDefinition } from '@/components/TabNav'
import TasksSummaryTab from '@/features/clients/components/TasksSummaryTab'
import AgendasTab from '@/features/clients/components/AgendasTab'
import TranscriptsTab from '@/features/clients/components/TranscriptsTab'
import SettingsTab from '@/features/clients/components/SettingsTab'
import HistoryTab from '@/features/clients/components/HistoryTab'
import styles from './ClientDetailPage.module.scss'

const TABS: TabDefinition[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'agendas', label: 'Agendas' },
  { id: 'transcripts', label: 'Transcripts' },
  { id: 'settings', label: 'Settings' },
  { id: 'history', label: 'History' },
] as const

type TabId = (typeof TABS)[number]['id']

const VALID_TAB_IDS = new Set(TABS.map((t) => t.id))

interface ClientDetailPageProps {
  client: Client
}

export default function ClientDetailPage({ client }: ClientDetailPageProps) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const rawTab = searchParams.get('tab')
  const activeTab: TabId = rawTab && VALID_TAB_IDS.has(rawTab) ? rawTab : 'tasks'

  // Track which tabs have been activated (for lazy loading)
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(
    () => new Set([activeTab])
  )

  // Dirty state from Settings tab
  const [hasDirtySettings, setHasDirtySettings] = useState(false)

  const setActiveTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', tab)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [searchParams, router]
  )

  const handleTabChange = useCallback(
    (tab: string) => {
      // Guard: warn if leaving Settings with unsaved changes
      if (hasDirtySettings && activeTab === 'settings') {
        const confirmed = window.confirm(
          'You have unsaved settings changes. Leave without saving?'
        )
        if (!confirmed) return
      }

      setMountedTabs((prev) => {
        const next = new Set(prev)
        next.add(tab)
        return next
      })
      setActiveTab(tab)
    },
    [hasDirtySettings, activeTab, setActiveTab]
  )

  const handleDirtyChange = useCallback((isDirty: boolean) => {
    setHasDirtySettings(isDirty)
  }, [])

  // Find workspace name from the client data
  // The client has defaultAsanaWorkspaceId but not the workspace name directly.
  // We show the ID as fallback; the Settings tab will load the full list.
  const workspaceName = client.defaultAsanaWorkspaceId
    ? `Workspace: ${client.defaultAsanaWorkspaceId}`
    : null

  return (
    <div className={styles.page} data-testid="client-detail-page">
      <ClientHeader
        name={client.name}
        workspaceName={workspaceName}
        grainPlaylistId={client.grainPlaylistId}
      />

      <div className={styles.tabSection}>
        <TabNav
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />

        <Suspense fallback={null}>
          <TabPanel id="tasks" activeTab={activeTab}>
            {mountedTabs.has('tasks') && (
              <TasksSummaryTab
                clientId={client.id}
                enabled={mountedTabs.has('tasks')}
              />
            )}
          </TabPanel>

          <TabPanel id="agendas" activeTab={activeTab}>
            {mountedTabs.has('agendas') && (
              <AgendasTab
                clientId={client.id}
                enabled={mountedTabs.has('agendas')}
              />
            )}
          </TabPanel>

          <TabPanel id="transcripts" activeTab={activeTab}>
            {mountedTabs.has('transcripts') && (
              <TranscriptsTab
                clientId={client.id}
                enabled={mountedTabs.has('transcripts')}
              />
            )}
          </TabPanel>

          <TabPanel id="settings" activeTab={activeTab}>
            {mountedTabs.has('settings') && (
              <SettingsTab
                client={client}
                onDirtyChange={handleDirtyChange}
              />
            )}
          </TabPanel>

          <TabPanel id="history" activeTab={activeTab}>
            {mountedTabs.has('history') && (
              <HistoryTab
                clientId={client.id}
                enabled={mountedTabs.has('history')}
              />
            )}
          </TabPanel>
        </Suspense>
      </div>
    </div>
  )
}
