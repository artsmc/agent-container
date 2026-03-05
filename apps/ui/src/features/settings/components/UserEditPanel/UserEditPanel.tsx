'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SettingsProductUser } from '../../types';
import {
  fetchClients,
  updateUserRole,
  updateUserClients,
  type ClientOption,
} from '../../hooks/use-settings-api';
import styles from './UserEditPanel.module.scss';

interface UserEditPanelProps {
  user: SettingsProductUser;
  onSave: (updatedUser: SettingsProductUser) => void;
  onClose: () => void;
  isSelf: boolean;
}

const ROLE_OPTIONS: Array<{
  value: SettingsProductUser['role'];
  label: string;
}> = [
  { value: 'admin', label: 'Admin' },
  { value: 'account_manager', label: 'Account Manager' },
  { value: 'team_member', label: 'Team Member' },
];

/**
 * UserEditPanel -- inline panel for editing a user's role and client assignments.
 *
 * The role selector is disabled when editing your own account (isSelf).
 * Client assignments are shown as a checklist of all available clients.
 */
export function UserEditPanel({
  user,
  onSave,
  onClose,
  isSelf,
}: UserEditPanelProps) {
  const [role, setRole] = useState<SettingsProductUser['role']>(user.role);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(
    new Set(user.assignedClients.map((c) => c.id))
  );
  const [allClients, setAllClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadClients() {
      try {
        const clients = await fetchClients();
        if (!cancelled) setAllClients(clients);
      } catch {
        if (!cancelled) setAllClients([]);
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    }
    loadClients();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClientToggle = useCallback((clientId: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setError(null);
    setSaving(true);

    try {
      let updatedUser = user;
      const roleChanged = role !== user.role;
      const clientIds = Array.from(selectedClientIds);
      const originalClientIds = user.assignedClients.map((c) => c.id);
      const clientsChanged =
        clientIds.length !== originalClientIds.length ||
        clientIds.some((id) => !originalClientIds.includes(id));

      if (roleChanged) {
        updatedUser = await updateUserRole(user.id, role);
      }

      if (clientsChanged) {
        updatedUser = await updateUserClients(user.id, clientIds);
      }

      onSave(updatedUser);
    } catch {
      setError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [role, selectedClientIds, user, onSave]);

  return (
    <div
      className={styles.root}
      data-testid={`user-edit-panel-${user.id}`}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>
          Edit {user.name}
        </h3>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close edit panel"
          data-testid="user-edit-close"
        >
          &times;
        </button>
      </div>

      <div className={styles.body}>
        {/* Role Selector */}
        <div className={styles.field}>
          <label htmlFor={`role-select-${user.id}`} className={styles.label}>
            Role
          </label>
          <select
            id={`role-select-${user.id}`}
            className={styles.select}
            value={role}
            onChange={(e) =>
              setRole(e.target.value as SettingsProductUser['role'])
            }
            disabled={isSelf || saving}
            data-testid="role-select"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {isSelf && (
            <p className={styles.fieldHint}>
              You cannot change your own role.
            </p>
          )}
        </div>

        {/* Client Assignments */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Client Assignments</legend>
          {clientsLoading ? (
            <div className={styles.clientsLoading}>Loading clients...</div>
          ) : allClients.length === 0 ? (
            <p className={styles.fieldHint}>No clients available.</p>
          ) : (
            <div
              className={styles.clientCheckboxes}
              data-testid="client-checkboxes"
            >
              {allClients.map((client) => (
                <label
                  key={client.id}
                  className={styles.checkboxLabel}
                >
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={selectedClientIds.has(client.id)}
                    onChange={() => handleClientToggle(client.id)}
                    disabled={saving}
                    data-testid={`client-checkbox-${client.id}`}
                  />
                  {client.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {error && (
          <p
            className={styles.errorMessage}
            role="alert"
            data-testid="user-edit-error"
          >
            {error}
          </p>
        )}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSave}
          disabled={saving}
          data-testid="user-edit-save"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
