/**
 * Administrator overview.
 *
 * System-wide totals plus a live feed from the audit trail, so an operator can
 * see what has actually been happening rather than only static counts.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { adminService } from '../../services/resources.js';
import { queryKeys } from '../../services/queryKeys.js';
import { useDocumentTitle } from '../../hooks/useApp.js';
import {
  Alert,
  Badge,
  ButtonLink,
  ErrorState,
  Icon,
  SectionHeading,
  StatCard,
} from '../../components/ui/index.js';
import { formatRelative, humaniseAction } from '../../utils/format.js';

export function AdminOverviewPage({ basePath = '/admin' }) {
  useDocumentTitle('Admin dashboard');

  const overviewQuery = useQuery({
    queryKey: queryKeys.adminOverview,
    queryFn: () => adminService.overview(),
    refetchInterval: 60_000,
  });

  if (overviewQuery.isError) {
    return (
      <ErrorState
        title="Unable to load the admin overview"
        message={overviewQuery.error?.message ?? 'Please try again.'}
        onRetry={() => overviewQuery.refetch()}
      />
    );
  }

  const system = overviewQuery.data?.system;
  const catalogue = overviewQuery.data?.catalogue;
  const activity = overviewQuery.data?.recentActivity ?? [];

  return (
    <div>
      <SectionHeading
        title="System overview"
        description="Accounts, catalogue size and recent activity across the whole application."
        action={
          <ButtonLink to={`${basePath}/audit-logs`} variant="outline">
            <Icon name="list" className="h-4 w-4" />
            View audit trail
          </ButtonLink>
        }
      />

      {/* Accounts */}
      <h2 className="mt-8 text-sm font-bold uppercase tracking-wider text-neutral-500">Accounts</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={system?.users?.total} icon="users" tone="cobalt" />
        <StatCard label="Travelers" value={system?.users?.travelers} icon="user" />
        <StatCard label="Curators" value={system?.users?.curators} icon="pencil" />
        <StatCard label="Administrators" value={system?.users?.admins} icon="shield" />
      </div>

      {/* Content */}
      <h2 className="mt-8 text-sm font-bold uppercase tracking-wider text-neutral-500">Content</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Attractions"
          value={system?.attractions}
          icon="compass"
          tone="cobalt"
          hint={catalogue ? `${catalogue.unmappedAttractions} without coordinates` : undefined}
        />
        <StatCard label="Categories" value={system?.categories} icon="layers" tone="cobalt" />
        <StatCard
          label="Saved places"
          value={system?.savedPlaces}
          icon="bookmark"
          tone="cobalt"
          hint="Across all travelers"
        />
        <StatCard
          label="Itineraries"
          value={system?.itineraries}
          icon="route"
          tone="cobalt"
          hint={system ? `${system.itineraryItems} planned stops` : undefined}
        />
      </div>

      {/* Activity */}
      <h2 className="mt-8 text-sm font-bold uppercase tracking-wider text-neutral-500">Activity</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Events in the last 24 hours"
          value={system?.eventsLast24Hours}
          icon="trending-up"
          tone="cobalt"
        />
        <StatCard
          label="Active sessions"
          value={system?.activeSessions}
          icon="lock"
          hint="Unexpired sign-ins"
        />
      </div>

      {/* Audit feed */}
      <section className="card mt-8 overflow-hidden" aria-labelledby="activity-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 p-5">
          <div>
            <h2 id="activity-heading" className="text-base font-bold text-black">
              Recent activity
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              The eight most recent entries in the audit trail.
            </p>
          </div>
          <ButtonLink to={`${basePath}/audit-logs`} variant="ghost" size="sm">
            See all
            <Icon name="arrow-right" className="h-3.5 w-3.5" />
          </ButtonLink>
        </div>

        {overviewQuery.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton h-12 w-full" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <p className="p-5 text-sm text-neutral-600">No activity recorded yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {activity.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Badge variant="neutral">{humaniseAction(entry.action)}</Badge>

                <span className="min-w-0 flex-1 text-sm text-neutral-700">
                  {entry.actor ? (
                    <Link
                      to={`${basePath}/users?search=${encodeURIComponent(entry.actor.name)}`}
                      className="font-semibold text-black hover:text-cobalt-700"
                    >
                      {entry.actor.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-neutral-500">Anonymous</span>
                  )}
                  {entry.entityType ? (
                    <span className="text-neutral-500">
                      {' '}
                      · {entry.entityType}
                      {entry.entityId ? ` #${entry.entityId}` : ''}
                    </span>
                  ) : null}
                </span>

                <span className="shrink-0 text-xs text-neutral-500">
                  {formatRelative(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Alert variant="info" className="mt-6" title="Audit trail">
        Role changes, attraction and category changes, sign-ins and geocoding lookups are all recorded
        with the acting account, the affected entity and a timestamp. Passwords and session tokens are
        never written to the log.
      </Alert>
    </div>
  );
}

export default AdminOverviewPage;
