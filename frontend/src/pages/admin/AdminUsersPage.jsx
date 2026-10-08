/**
 * User and role management.
 *
 * Role changes go through the API, which refuses to demote the last remaining
 * administrator. That guard is surfaced here rather than being hidden, because
 * an operator needs to understand why the change was rejected.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminService } from '../../services/resources.js';
import { queryKeys } from '../../services/queryKeys.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useDebounce, useDocumentTitle } from '../../hooks/useApp.js';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  Modal,
  Pagination,
  RoleBadge,
  SectionHeading,
  SelectField,
  SkeletonRows,
  TableWrapper,
  TextField,
} from '../../components/ui/index.js';
import { formatDate, ROLE_LABELS } from '../../utils/format.js';

const PAGE_SIZE = 20;

/** Confirmation before a role change, spelling out what the role can do. */
function RoleChangeDialog({ user, nextRole, onClose, onConfirm, loading }) {
  const ROLE_DESCRIPTIONS = {
    traveler: 'Can browse and search attractions, save places and manage their own itineraries.',
    curator: 'Can additionally create, edit and delete attractions and categories.',
    admin: 'Can additionally manage user roles and view the audit trail.',
  };

  const isElevation = nextRole === 'admin' || (nextRole === 'curator' && user.role === 'traveler');

  return (
    <Modal
      open
      onClose={loading ? () => {} : onClose}
      title={isElevation ? 'Grant elevated access?' : 'Change this account’s role?'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={loading}>
            Change role
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-neutral-700">
        <strong className="text-black">{user.name}</strong> ({user.email}) will change from{' '}
        <strong>{ROLE_LABELS[user.role]}</strong> to <strong>{ROLE_LABELS[nextRole]}</strong>.
      </p>

      <Alert variant={isElevation ? 'warning' : 'info'} className="mt-4">
        {ROLE_DESCRIPTIONS[nextRole]}
      </Alert>
    </Modal>
  );
}

export function AdminUsersPage() {
  useDocumentTitle('Users');

  const { user: currentUser } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const role = searchParams.get('role') ?? '';
  const page = Math.max(Number(searchParams.get('page')) || 1, 1);

  const [searchDraft, setSearchDraft] = useState(search);
  const debouncedSearch = useDebounce(searchDraft, 350);

  const [roleChange, setRoleChange] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    if (debouncedSearch === search) return;

    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set('search', debouncedSearch);
    else next.delete('search');
    next.delete('page');
    setSearchParams(next, { replace: true });
    // Keyed on the debounced value only, to avoid re-running on its own update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const params = {
    search: search || undefined,
    role: role || undefined,
    page,
    limit: PAGE_SIZE,
  };

  const usersQuery = useQuery({
    queryKey: queryKeys.adminUsers(params),
    queryFn: () => adminService.users(params),
    placeholderData: keepPreviousData,
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, nextRole }) => adminService.updateUserRole(id, nextRole),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success(`${data.user.name} is now a ${ROLE_LABELS[data.user.role]}.`);
      setRoleChange(null);
    },
    onError: (error) => {
      toast.error(error?.message ?? 'We could not change that role.');
      setRoleChange(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => adminService.removeUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success('User account deleted.');
      setPendingDelete(null);
    },
    onError: (error) => {
      toast.error(error?.message ?? 'We could not delete that account.');
      setPendingDelete(null);
    },
  });

  const users = usersQuery.data?.items ?? [];
  const pagination = usersQuery.data?.pagination ?? null;
  const hasFilters = Boolean(search || role);

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
        title="Users"
        description="Every account in the system, with the role that determines what it can do."
      />

      {/* Filters */}
      <div className="card mt-6 p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <TextField
            label="Search users"
            placeholder="Name or email address"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            autoComplete="off"
          />

          <SelectField
            label="Role"
            value={role}
            onChange={(event) => updateParam('role', event.target.value)}
          >
            <option value="">All roles</option>
            <option value="traveler">Travelers</option>
            <option value="curator">Curators</option>
            <option value="admin">Administrators</option>
          </SelectField>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <p className="text-sm text-neutral-600">
            {pagination ? (
              <>
                <span className="font-semibold text-black">{pagination.totalItems}</span> account
                {pagination.totalItems === 1 ? '' : 's'}
                {hasFilters ? ' match your filters' : ''}
              </>
            ) : (
              'Loading…'
            )}
          </p>

          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchDraft('');
                setSearchParams({}, { replace: true });
              }}
            >
              <Icon name="refresh" className="h-4 w-4" />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <div className="card mt-6 overflow-hidden">
        {usersQuery.isPending ? (
          <div className="p-6">
            <SkeletonRows count={6} />
          </div>
        ) : usersQuery.isError ? (
          <div className="p-6">
            <ErrorState
              title="Unable to load users"
              message={usersQuery.error?.message ?? 'Please try again.'}
              onRetry={() => usersQuery.refetch()}
            />
          </div>
        ) : users.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon="users"
              title="No users match those filters"
              description="Try a different search term or clear the filters."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchDraft('');
                    setSearchParams({}, { replace: true });
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <TableWrapper>
            <table className="table">
              <caption className="sr-only">User accounts</caption>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Role</th>
                  <th scope="col" className="hidden md:table-cell">
                    Activity
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Joined
                  </th>
                  <th scope="col" className="text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.id === currentUser?.id;

                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={user.name} size="sm" />
                          <div className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-black">
                                {user.name}
                              </span>
                              {isSelf ? (
                                <Badge variant="cobalt" className="shrink-0">
                                  You
                                </Badge>
                              ) : null}
                            </span>
                            <span className="block truncate text-xs text-neutral-500">
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <RoleBadge role={user.role} />
                      </td>

                      <td className="hidden md:table-cell">
                        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
                          <span className="inline-flex items-center gap-1">
                            <Icon name="bookmark" className="h-3.5 w-3.5 text-cobalt-600" />
                            {user.savedCount} saved
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Icon name="route" className="h-3.5 w-3.5 text-cobalt-600" />
                            {user.itineraryCount} itineraries
                          </span>
                        </span>
                      </td>

                      <td className="hidden whitespace-nowrap text-sm text-neutral-600 lg:table-cell">
                        {formatDate(user.createdAt)}
                      </td>

                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <SelectField
                            aria-label={`Role for ${user.name}`}
                            value={user.role}
                            disabled={isSelf}
                            title={isSelf ? 'You cannot change your own role' : undefined}
                            onChange={(event) =>
                              setRoleChange({ user, nextRole: event.target.value })
                            }
                            containerClassName="w-36"
                            className="py-1 text-xs"
                          >
                            <option value="traveler">Traveler</option>
                            <option value="curator">Curator</option>
                            <option value="admin">Administrator</option>
                          </SelectField>

                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            title={isSelf ? 'You cannot delete your own account here' : undefined}
                            onClick={() => setPendingDelete(user)}
                            aria-label={`Delete ${user.name}`}
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          itemLabel="accounts"
        />
      ) : null}

      <Alert variant="info" className="mt-6" title="Role changes are enforced server-side">
        Promoting or demoting an account takes effect immediately on the API. The last remaining
        administrator cannot be demoted or deleted, which prevents the system from being locked out.
      </Alert>

      {roleChange ? (
        <RoleChangeDialog
          user={roleChange.user}
          nextRole={roleChange.nextRole}
          loading={roleMutation.isPending}
          onClose={() => setRoleChange(null)}
          onConfirm={() =>
            roleMutation.mutate({ id: roleChange.user.id, nextRole: roleChange.nextRole })
          }
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        loading={deleteMutation.isPending}
        title="Delete this account?"
        message={`“${pendingDelete?.name}” (${pendingDelete?.email}) will be permanently deleted along with their saved places and ${pendingDelete?.itineraryCount ?? 0} itineraries. Attractions they created are kept.`}
        confirmLabel="Delete account"
      />
    </div>
  );
}

export default AdminUsersPage;
