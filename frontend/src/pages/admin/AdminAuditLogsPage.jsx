/**
 * Audit trail viewer.
 *
 * Every security-relevant and content action is recorded server-side. This page
 * makes that trail inspectable: who did what, to which entity, when, and from
 * which address.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { adminService } from '../../services/resources.js';
import { queryKeys } from '../../services/queryKeys.js';
import { useDocumentTitle } from '../../hooks/useApp.js';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Pagination,
  SectionHeading,
  SelectField,
  SkeletonRows,
  TableWrapper,
} from '../../components/ui/index.js';
import { formatDateTime, formatRelative, humaniseAction } from '../../utils/format.js';

const PAGE_SIZE = 25;

/** Colours actions by their area so the table can be scanned quickly. */
function actionVariant(action) {
  if (action.startsWith('auth.login_failed') || action.includes('delete')) return 'danger';
  if (action.startsWith('auth.')) return 'cobalt';
  if (action.startsWith('user.')) return 'warning';
  if (action.startsWith('attraction.') || action.startsWith('category.')) return 'success';
  return 'neutral';
}

/** Renders the metadata object as a compact definition list. */
function MetadataDetails({ metadata }) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return <span className="text-xs text-neutral-400">No additional data</span>;
  }

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs font-medium text-cobalt-700 hover:underline">
        View details
      </summary>
      <dl className="mt-2 space-y-1 rounded-lg bg-neutral-50 p-3">
        {Object.entries(metadata).map(([key, value]) => (
          <div key={key} className="flex gap-2 text-xs">
            <dt className="shrink-0 font-semibold text-neutral-600">{key}:</dt>
            <dd className="min-w-0 break-words font-mono text-neutral-700">
              {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function AdminAuditLogsPage() {
  useDocumentTitle('Audit logs');

  const [searchParams, setSearchParams] = useSearchParams();

  const action = searchParams.get('action') ?? '';
  const entityType = searchParams.get('entityType') ?? '';
  const page = Math.max(Number(searchParams.get('page')) || 1, 1);

  const params = {
    action: action || undefined,
    entityType: entityType || undefined,
    page,
    limit: PAGE_SIZE,
  };

  const logsQuery = useQuery({
    queryKey: queryKeys.adminAuditLogs(params),
    queryFn: () => adminService.auditLogs(params),
    placeholderData: keepPreviousData,
  });

  const actionsQuery = useQuery({
    queryKey: queryKeys.adminAuditActions,
    queryFn: () => adminService.auditActions(),
    staleTime: 60_000,
  });

  const logs = logsQuery.data?.items ?? [];
  const pagination = logsQuery.data?.pagination ?? null;
  const actions = actionsQuery.data?.actions ?? [];
  const hasFilters = Boolean(action || entityType);

  function updateParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
  }

  return (
    <div>
      <SectionHeading
        title="Audit logs"
        description="An append-only record of authentication events, content changes, role changes and location lookups."
      />

      {/* Filters */}
      <div className="card mt-6 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Action"
            value={action}
            onChange={(event) => updateParam('action', event.target.value)}
          >
            <option value="">All actions</option>
            {actions.map((entry) => (
              <option key={entry} value={entry}>
                {humaniseAction(entry)}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Entity type"
            value={entityType}
            onChange={(event) => updateParam('entityType', event.target.value)}
          >
            <option value="">All entity types</option>
            {['attraction', 'category', 'user', 'itinerary', 'location'].map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <p className="text-sm text-neutral-600">
            {pagination ? (
              <>
                <span className="font-semibold text-black">{pagination.totalItems}</span> recorded
                event{pagination.totalItems === 1 ? '' : 's'}
                {hasFilters ? ' match your filters' : ''}
              </>
            ) : (
              'Loading…'
            )}
          </p>

          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={() => setSearchParams({}, { replace: true })}>
              <Icon name="refresh" className="h-4 w-4" />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <div className="card mt-6 overflow-hidden">
        {logsQuery.isPending ? (
          <div className="p-6">
            <SkeletonRows count={8} />
          </div>
        ) : logsQuery.isError ? (
          <div className="p-6">
            <ErrorState
              title="Unable to load the audit trail"
              message={logsQuery.error?.message ?? 'Please try again.'}
              onRetry={() => logsQuery.refetch()}
            />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon="list"
              title="No audit events match those filters"
              description="Try a different action or entity type."
              action={
                <Button variant="outline" onClick={() => setSearchParams({}, { replace: true })}>
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <TableWrapper>
            <table className="table">
              <caption className="sr-only">Audit log entries</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Entity</th>
                  <th scope="col" className="hidden lg:table-cell">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap">
                      <span className="block text-sm text-black">
                        {formatRelative(entry.createdAt)}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {formatDateTime(entry.createdAt)}
                      </span>
                    </td>

                    <td>
                      {entry.actor ? (
                        <>
                          <span className="block text-sm font-medium text-black">
                            {entry.actor.name}
                          </span>
                          <span className="block text-xs text-neutral-500">#{entry.actor.id}</span>
                        </>
                      ) : (
                        <span className="text-sm text-neutral-500">Anonymous</span>
                      )}
                    </td>

                    <td>
                      <Badge variant={actionVariant(entry.action)}>
                        {humaniseAction(entry.action)}
                      </Badge>
                    </td>

                    <td className="whitespace-nowrap text-sm text-neutral-600">
                      {entry.entityType}
                      {entry.entityId ? (
                        <span className="ml-1 font-mono text-xs text-neutral-500">
                          #{entry.entityId}
                        </span>
                      ) : null}
                    </td>

                    <td className="hidden lg:table-cell">
                      <MetadataDetails metadata={entry.metadata} />
                      {entry.ipAddress ? (
                        <span className="mt-1 block font-mono text-xs text-neutral-400">
                          {entry.ipAddress}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </div>

      {pagination && pagination.totalItems > 0 ? (
        <Pagination
          className="mt-6"
          pagination={pagination}
          onPageChange={(next) => updateParam('page', next > 1 ? next : '')}
          itemLabel="events"
        />
      ) : null}

      <Alert variant="info" className="mt-6" title="What is deliberately not logged">
        Passwords, password hashes, session tokens and cookie headers are redacted before any log line
        is written. The metadata column holds only the fields needed to understand the change.
      </Alert>
    </div>
  );
}

export default AdminAuditLogsPage;
