'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AuditEvent, AuditFilters } from '../../types';
import { fetchAuditLog, fetchAdminUsers } from '../../hooks/use-settings-api';
import { getEntityRoute } from '../../utils/get-entity-route';
import { AuditLogFilters } from '../AuditLogFilters';
import styles from './AuditLogTab.module.scss';

interface AuditLogTabProps {
  userRole: 'admin' | 'account_manager';
}

const EMPTY_FILTERS: AuditFilters = {
  userId: null,
  entityType: null,
  action: null,
  dateFrom: null,
  dateTo: null,
};

const PAGE_SIZE = 25;

/**
 * AuditLogTab -- filterable, paginated audit log table.
 *
 * Admin users see all audit events with a user filter dropdown.
 * Account managers see only their scoped events (enforced by the API).
 */
export function AuditLogTab({ userRole }: AuditLogTabProps) {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);

  // Fetch user list for filter dropdown (admin only)
  useEffect(() => {
    if (userRole !== 'admin') return;
    let cancelled = false;
    async function loadUsers() {
      try {
        const allUsers = await fetchAdminUsers();
        if (!cancelled) {
          setUsers(allUsers.map((u) => ({ id: u.id, name: u.name })));
        }
      } catch {
        // Non-critical: filter will work without user list
      }
    }
    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [userRole]);

  // Fetch audit log
  const loadAuditLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAuditLog(filters, page, PAGE_SIZE);
      setData(result.data);
      setTotal(result.total);
    } catch {
      setError('Failed to load audit log. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    loadAuditLog();
  }, [loadAuditLog]);

  const handleApplyFilters = useCallback((newFilters: AuditFilters) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString();
  };

  const formatAction = (action: string) => {
    return action
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getSourceClassName = (source: AuditEvent['source']): string => {
    switch (source) {
      case 'agent':
        return styles.sourceAgent;
      case 'ui':
        return styles.sourceUi;
      case 'terminal':
        return styles.sourceTerminal;
      default:
        return '';
    }
  };

  return (
    <div className={styles.root} data-testid="audit-log-tab">
      <h2 className={styles.heading}>Audit Log</h2>

      {/* Filters */}
      <AuditLogFilters
        users={users}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
      />

      {/* Loading Skeleton */}
      {loading && (
        <div className={styles.tableWrapper} data-testid="audit-loading">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">User</th>
                <th scope="col">Action</th>
                <th scope="col">Entity Type</th>
                <th scope="col">Entity</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className={styles.skeletonRow}>
                  <td colSpan={6}>
                    <div className={styles.skeletonCell} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div
          className={styles.errorState}
          role="alert"
          data-testid="audit-error"
        >
          <p>{error}</p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={loadAuditLog}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && data.length === 0 && (
        <div className={styles.emptyState} data-testid="audit-empty">
          <p>No audit events match your filters.</p>
        </div>
      )}

      {/* Audit Table */}
      {!loading && !error && data.length > 0 && (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table} data-testid="audit-table">
              <thead>
                <tr>
                  <th scope="col" className={styles.thTimestamp}>
                    Timestamp
                  </th>
                  <th scope="col" className={styles.thUser}>
                    User
                  </th>
                  <th scope="col" className={styles.thAction}>
                    Action
                  </th>
                  <th scope="col" className={styles.thEntity}>
                    Entity Type
                  </th>
                  <th scope="col" className={styles.thEntityId}>
                    Entity
                  </th>
                  <th scope="col" className={styles.thSource}>
                    Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((event) => {
                  const entityRoute = getEntityRoute(
                    event.entityType,
                    event.entityShortId
                  );
                  return (
                    <tr
                      key={event.id}
                      className={styles.row}
                      data-testid={`audit-row-${event.id}`}
                    >
                      <td className={styles.cellTimestamp}>
                        {formatTimestamp(event.createdAt)}
                      </td>
                      <td className={styles.cellUser}>
                        {event.userName ?? 'Agent'}
                      </td>
                      <td className={styles.cellAction}>
                        {formatAction(event.action)}
                      </td>
                      <td className={styles.cellEntityType}>
                        {event.entityType}
                      </td>
                      <td className={styles.cellEntityId}>
                        {entityRoute ? (
                          <a
                            href={entityRoute}
                            className={styles.entityLink}
                            data-testid={`entity-link-${event.id}`}
                          >
                            {event.entityShortId ?? event.entityId}
                          </a>
                        ) : (
                          <span>
                            {event.entityShortId ?? event.entityId}
                          </span>
                        )}
                      </td>
                      <td className={styles.cellSource}>
                        <span
                          className={`${styles.sourceBadge} ${getSourceClassName(event.source)}`}
                        >
                          {event.source}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className={styles.pagination} data-testid="audit-pagination">
            <span className={styles.paginationInfo}>
              Showing {rangeStart}&ndash;{rangeEnd} of {total} events
            </span>
            <div className={styles.paginationControls}>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                data-testid="pagination-prev"
              >
                Previous
              </button>
              <span className={styles.pageIndicator}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                data-testid="pagination-next"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
