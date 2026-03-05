'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SettingsProductUser } from '../../types';
import { fetchAdminUsers, deactivateUser } from '../../hooks/use-settings-api';
import { UserEditPanel } from '../UserEditPanel';
import { ConfirmationDialog } from '../ConfirmationDialog';
import styles from './UsersRolesTab.module.scss';

interface UsersRolesTabProps {
  currentUserId: string;
}

const ROLE_LABELS: Record<SettingsProductUser['role'], string> = {
  admin: 'Admin',
  account_manager: 'Account Manager',
  team_member: 'Team Member',
};

const ROLE_VARIANTS: Record<
  SettingsProductUser['role'],
  'info' | 'warning' | 'default'
> = {
  admin: 'info',
  account_manager: 'warning',
  team_member: 'default',
};

/**
 * UsersRolesTab -- manage user roles and client assignments.
 *
 * Displays a user list with role badges, edit and deactivate actions.
 * The current user's row does not show a Deactivate button (self-protection).
 */
export function UsersRolesTab({ currentUserId }: UsersRolesTabProps) {
  const [users, setUsers] = useState<SettingsProductUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<SettingsProductUser | null>(
    null
  );
  const [deactivateTarget, setDeactivateTarget] =
    useState<SettingsProductUser | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminUsers();
      setUsers(data);
    } catch {
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleUserSaved = useCallback(
    (updatedUser: SettingsProductUser) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
      );
      setEditingUser(null);
    },
    []
  );

  const handleConfirmDeactivate = useCallback(async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await deactivateUser(deactivateTarget.id);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === deactivateTarget.id ? { ...u, isActive: false } : u
        )
      );
      setDeactivateTarget(null);
    } catch {
      setError('Failed to deactivate user. Please try again.');
    } finally {
      setDeactivating(false);
    }
  }, [deactivateTarget]);

  return (
    <div className={styles.root} data-testid="users-roles-tab">
      <h2 className={styles.heading}>Users & Roles</h2>
      <p className={styles.description}>
        Manage user roles and client assignments.
      </p>

      {/* Loading State */}
      {loading && (
        <div className={styles.loadingState} data-testid="users-loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.skeletonRow} />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div
          className={styles.errorState}
          role="alert"
          data-testid="users-error"
        >
          <p>{error}</p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={loadUsers}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && users.length === 0 && (
        <div className={styles.emptyState} data-testid="users-empty">
          <p>No users found.</p>
        </div>
      )}

      {/* User Table */}
      {!loading && !error && users.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table} data-testid="users-table">
            <thead>
              <tr>
                <th scope="col" className={styles.thName}>
                  Name
                </th>
                <th scope="col" className={styles.thEmail}>
                  Email
                </th>
                <th scope="col" className={styles.thRole}>
                  Role
                </th>
                <th scope="col" className={styles.thClients}>
                  Clients
                </th>
                <th scope="col" className={styles.thActions}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.authUserId === currentUserId;
                const isInactive = !user.isActive;
                return (
                  <tr
                    key={user.id}
                    className={`${styles.row} ${isInactive ? styles.inactive : ''}`}
                    data-testid={`user-row-${user.id}`}
                  >
                    <td className={styles.cellName}>
                      {user.name}
                      {isSelf && (
                        <span className={styles.youBadge}>(You)</span>
                      )}
                    </td>
                    <td className={styles.cellEmail}>{user.email}</td>
                    <td className={styles.cellRole}>
                      {isInactive ? (
                        <span
                          className={styles.roleBadge}
                          data-variant="danger"
                        >
                          Deactivated
                        </span>
                      ) : (
                        <span
                          className={styles.roleBadge}
                          data-variant={ROLE_VARIANTS[user.role]}
                        >
                          {ROLE_LABELS[user.role]}
                        </span>
                      )}
                    </td>
                    <td className={styles.cellClients}>
                      {user.assignedClients.length}
                    </td>
                    <td className={styles.cellActions}>
                      {!isInactive && (
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => setEditingUser(user)}
                          data-testid={`edit-user-${user.id}`}
                        >
                          Edit
                        </button>
                      )}
                      {!isInactive && !isSelf && (
                        <button
                          type="button"
                          className={styles.deactivateButton}
                          onClick={() => setDeactivateTarget(user)}
                          data-testid={`deactivate-user-${user.id}`}
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Panel */}
      {editingUser && (
        <div className={styles.editPanelWrapper}>
          <UserEditPanel
            user={editingUser}
            onSave={handleUserSaved}
            onClose={() => setEditingUser(null)}
            isSelf={editingUser.authUserId === currentUserId}
          />
        </div>
      )}

      {/* Deactivate Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deactivateTarget !== null}
        title="Deactivate User"
        body={`Are you sure you want to deactivate "${deactivateTarget?.name ?? ''}"? They will lose access to the platform.`}
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDeactivate}
        onCancel={() => setDeactivateTarget(null)}
        isConfirming={deactivating}
      />
    </div>
  );
}
