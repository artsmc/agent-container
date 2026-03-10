'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/auth/AuthProvider'
import { CreateClientModal } from './CreateClientModal'
import styles from './CreateClientButton.module.scss'

/**
 * CreateClientButton -- renders a "New Client" button that opens a
 * modal for creating a new client. On success, triggers a router
 * refresh to reload server component data.
 *
 * Only visible to admins and account managers.
 */
export function CreateClientButton() {
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()
  const { user } = useAuth()

  const handleCreated = useCallback(() => {
    setModalOpen(false)
    router.refresh()
  }, [router])

  if (user.role === 'team_member') {
    return null
  }

  return (
    <>
      <button
        type="button"
        data-testid="new-client-button"
        className={styles.trigger}
        onClick={() => setModalOpen(true)}
      >
        + New Client
      </button>
      <CreateClientModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </>
  )
}
