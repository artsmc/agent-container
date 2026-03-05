'use client';

import { useState, useCallback, useMemo } from 'react';
import type { AuditFilters } from '../../types';
import styles from './AuditLogFilters.module.scss';

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'All Entity Types' },
  { value: 'task', label: 'Task' },
  { value: 'agenda', label: 'Agenda' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'client', label: 'Client' },
];

const ACTION_TYPE_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'task.created', label: 'Task Created' },
  { value: 'task.approved', label: 'Task Approved' },
  { value: 'task.rejected', label: 'Task Rejected' },
  { value: 'task.pushed', label: 'Task Pushed' },
  { value: 'task.updated', label: 'Task Updated' },
  { value: 'agenda.created', label: 'Agenda Created' },
  { value: 'agenda.finalized', label: 'Agenda Finalized' },
  { value: 'agenda.shared', label: 'Agenda Shared' },
  { value: 'agenda.emailed', label: 'Agenda Emailed' },
  { value: 'transcript.submitted', label: 'Transcript Submitted' },
  { value: 'client.updated', label: 'Client Updated' },
  { value: 'user.role_changed', label: 'User Role Changed' },
  { value: 'user.deactivated', label: 'User Deactivated' },
];

interface AuditLogFiltersProps {
  users: Array<{ id: string; name: string }>;
  onApply: (filters: AuditFilters) => void;
  onClear: () => void;
}

const EMPTY_FILTERS: AuditFilters = {
  userId: null,
  entityType: null,
  action: null,
  dateFrom: null,
  dateTo: null,
};

/**
 * AuditLogFilters -- filter controls for the audit log.
 *
 * Provides dropdowns for user, entity type, and action type,
 * plus date range inputs. Shows an active filter count badge.
 */
export function AuditLogFilters({
  users,
  onApply,
  onClear,
}: AuditLogFiltersProps) {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);

  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.userId) count++;
    if (filters.entityType) count++;
    if (filters.action) count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    return count;
  }, [filters]);

  const handleApply = useCallback(() => {
    onApply(filters);
  }, [filters, onApply]);

  const handleClear = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    onClear();
  }, [onClear]);

  return (
    <div className={styles.root} data-testid="audit-log-filters">
      <div className={styles.filterRow}>
        {/* User Filter */}
        <div className={styles.filterField}>
          <label htmlFor="audit-user-filter" className={styles.label}>
            User
          </label>
          <select
            id="audit-user-filter"
            className={styles.select}
            value={filters.userId ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                userId: e.target.value || null,
              }))
            }
            data-testid="filter-user"
          >
            <option value="">All Users</option>
            <option value="__agent__">Agent (automated)</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        {/* Entity Type Filter */}
        <div className={styles.filterField}>
          <label htmlFor="audit-entity-filter" className={styles.label}>
            Entity Type
          </label>
          <select
            id="audit-entity-filter"
            className={styles.select}
            value={filters.entityType ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                entityType: e.target.value || null,
              }))
            }
            data-testid="filter-entity-type"
          >
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Action Type Filter */}
        <div className={styles.filterField}>
          <label htmlFor="audit-action-filter" className={styles.label}>
            Action
          </label>
          <select
            id="audit-action-filter"
            className={styles.select}
            value={filters.action ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                action: e.target.value || null,
              }))
            }
            data-testid="filter-action"
          >
            {ACTION_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range */}
        <div className={styles.filterField}>
          <label htmlFor="audit-date-from" className={styles.label}>
            From
          </label>
          <input
            id="audit-date-from"
            type="date"
            className={styles.dateInput}
            value={filters.dateFrom ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                dateFrom: e.target.value || null,
              }))
            }
            data-testid="filter-date-from"
          />
        </div>

        <div className={styles.filterField}>
          <label htmlFor="audit-date-to" className={styles.label}>
            To
          </label>
          <input
            id="audit-date-to"
            type="date"
            className={styles.dateInput}
            value={filters.dateTo ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                dateTo: e.target.value || null,
              }))
            }
            data-testid="filter-date-to"
          />
        </div>
      </div>

      <div className={styles.filterActions}>
        <button
          type="button"
          className={styles.applyButton}
          onClick={handleApply}
          data-testid="apply-filters"
        >
          Apply Filters
          {activeCount > 0 && (
            <span className={styles.filterBadge} data-testid="filter-count">
              {activeCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className={styles.clearButton}
          onClick={handleClear}
          disabled={activeCount === 0}
          data-testid="clear-filters"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
