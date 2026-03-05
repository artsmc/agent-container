'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SettingsAsanaWorkspace, TestConnectionStatus } from '../../types';
import {
  fetchAsanaWorkspaces,
  addAsanaWorkspace,
  deleteAsanaWorkspace,
  testAsanaConnection,
} from '../../hooks/use-settings-api';
import { ConfirmationDialog } from '../ConfirmationDialog';
import styles from './AsanaWorkspacesTab.module.scss';

interface FormState {
  name: string;
  asanaWorkspaceId: string;
  accessToken: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  asanaWorkspaceId: '',
  accessToken: '',
};

/**
 * AsanaWorkspacesTab -- manage Asana workspace integrations.
 *
 * Displays a list of configured workspaces with test/remove actions,
 * and an add-workspace form.
 */
export function AsanaWorkspacesTab() {
  const [workspaces, setWorkspaces] = useState<SettingsAsanaWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testStates, setTestStates] = useState<
    Record<string, TestConnectionStatus>
  >({});
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SettingsAsanaWorkspace | null>(null);
  const [deleting, setDeleting] = useState(false);
  const testTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    loadWorkspaces();
    return () => {
      Object.values(testTimers.current).forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAsanaWorkspaces();
      setWorkspaces(data);
    } catch {
      setError('Failed to load workspaces. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTestConnection = useCallback(async (workspaceId: string) => {
    setTestStates((prev) => ({ ...prev, [workspaceId]: 'testing' }));

    try {
      await testAsanaConnection(workspaceId);
      setTestStates((prev) => ({ ...prev, [workspaceId]: 'success' }));

      if (testTimers.current[workspaceId]) {
        clearTimeout(testTimers.current[workspaceId]);
      }
      testTimers.current[workspaceId] = setTimeout(() => {
        setTestStates((prev) => ({ ...prev, [workspaceId]: 'idle' }));
        delete testTimers.current[workspaceId];
      }, 3000);
    } catch {
      setTestStates((prev) => ({ ...prev, [workspaceId]: 'failed' }));
    }
  }, []);

  const handleAddWorkspace = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      if (!form.name.trim()) {
        setFormError('Workspace name is required.');
        return;
      }
      if (!form.accessToken.trim()) {
        setFormError('API token is required.');
        return;
      }

      setFormSubmitting(true);
      try {
        const newWorkspace = await addAsanaWorkspace({
          name: form.name.trim(),
          asanaWorkspaceId: form.asanaWorkspaceId.trim() || form.name.trim(),
          accessToken: form.accessToken.trim(),
        });
        setWorkspaces((prev) => [...prev, newWorkspace]);
        setForm(INITIAL_FORM);
      } catch {
        setFormError('Failed to add workspace. Please try again.');
      } finally {
        setFormSubmitting(false);
      }
    },
    [form]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAsanaWorkspace(deleteTarget.id);
      setWorkspaces((prev) => prev.filter((w) => w.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setFormError('Failed to remove workspace. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const getTestStatusLabel = (status: TestConnectionStatus | undefined) => {
    switch (status) {
      case 'testing':
        return 'Testing...';
      case 'success':
        return 'Connection OK';
      case 'failed':
        return 'Connection Failed';
      default:
        return 'Test Connection';
    }
  };

  const getTestStatusClassName = (
    status: TestConnectionStatus | undefined
  ) => {
    switch (status) {
      case 'success':
        return styles.testSuccess;
      case 'failed':
        return styles.testFailed;
      default:
        return '';
    }
  };

  return (
    <div className={styles.root} data-testid="asana-workspaces-tab">
      <h2 className={styles.heading}>Asana Workspaces</h2>
      <p className={styles.description}>
        Manage Asana workspace connections used for task synchronization.
      </p>

      {/* Workspace List */}
      <div className={styles.listSection}>
        {loading && (
          <div className={styles.loadingState} data-testid="workspaces-loading">
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
          </div>
        )}

        {error && !loading && (
          <div
            className={styles.errorState}
            role="alert"
            data-testid="workspaces-error"
          >
            <p>{error}</p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={loadWorkspaces}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && workspaces.length === 0 && (
          <div className={styles.emptyState} data-testid="workspaces-empty">
            <p>No workspaces configured. Add one below to get started.</p>
          </div>
        )}

        {!loading && !error && workspaces.length > 0 && (
          <ul className={styles.workspaceList} data-testid="workspace-list">
            {workspaces.map((workspace) => {
              const testStatus = testStates[workspace.id] ?? 'idle';
              return (
                <li
                  key={workspace.id}
                  className={styles.workspaceItem}
                  data-testid={`workspace-${workspace.id}`}
                >
                  <div className={styles.workspaceInfo}>
                    <span className={styles.workspaceName}>
                      {workspace.name}
                    </span>
                    {workspace.tokenConfigured && (
                      <span className={styles.tokenMask}>
                        {'Token: '}
                        {'••••••••'}
                        {workspace.tokenSuffix}
                      </span>
                    )}
                  </div>
                  <div className={styles.workspaceActions}>
                    <button
                      type="button"
                      className={`${styles.testButton} ${getTestStatusClassName(testStatus)}`}
                      onClick={() => handleTestConnection(workspace.id)}
                      disabled={testStatus === 'testing'}
                      data-testid={`test-connection-${workspace.id}`}
                    >
                      {testStatus === 'testing' && (
                        <span
                          className={styles.spinnerSmall}
                          aria-hidden="true"
                        />
                      )}
                      {getTestStatusLabel(testStatus)}
                    </button>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => setDeleteTarget(workspace)}
                      data-testid={`remove-workspace-${workspace.id}`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add Workspace Form */}
      <form
        className={styles.addForm}
        onSubmit={handleAddWorkspace}
        data-testid="add-workspace-form"
      >
        <h3 className={styles.formHeading}>Add Workspace</h3>
        <div className={styles.formFields}>
          <div className={styles.formField}>
            <label htmlFor="workspace-name" className={styles.label}>
              Workspace Name
            </label>
            <input
              id="workspace-name"
              type="text"
              className={styles.input}
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="My Workspace"
              disabled={formSubmitting}
              aria-describedby={formError ? 'form-error' : undefined}
            />
          </div>
          <div className={styles.formField}>
            <label htmlFor="workspace-token" className={styles.label}>
              API Token
            </label>
            <input
              id="workspace-token"
              type="password"
              className={styles.input}
              value={form.accessToken}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, accessToken: e.target.value }))
              }
              placeholder="Asana Personal Access Token"
              disabled={formSubmitting}
              aria-describedby={formError ? 'form-error' : undefined}
            />
          </div>
        </div>
        {formError && (
          <p
            id="form-error"
            className={styles.formErrorMessage}
            role="alert"
            data-testid="form-error"
          >
            {formError}
          </p>
        )}
        <button
          type="submit"
          className={styles.addButton}
          disabled={formSubmitting}
          data-testid="add-workspace-submit"
        >
          {formSubmitting ? 'Adding...' : 'Add Workspace'}
        </button>
      </form>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteTarget !== null}
        title="Remove Workspace"
        body={`Are you sure you want to remove "${deleteTarget?.name ?? ''}"? This action cannot be undone.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
        isConfirming={deleting}
      />
    </div>
  );
}
