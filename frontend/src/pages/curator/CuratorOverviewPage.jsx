/**
 * Curator dashboard overview.
 *
 * Leads with the work that needs doing — attractions with no coordinates and
 * categories that classify nothing — rather than only reporting totals.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { attractionService, curatorService } from '../../services/resources.js';
import { queryKeys } from '../../services/queryKeys.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDocumentTitle } from '../../hooks/useApp.js';
import {
  Alert,
  Badge,
  ButtonLink,
  ErrorState,
  Icon,
  SafeImage,
  SectionHeading,
  StatCard,
} from '../../components/ui/index.js';
import { formatDate } from '../../utils/format.js';

export function CuratorOverviewPage({ basePath = '/curator' }) {
  useDocumentTitle('Curator dashboard');
  const { user } = useAuth();

  const overviewQuery = useQuery({
    queryKey: queryKeys.curatorOverview,
    queryFn: () => curatorService.overview(),
  });

  const recentQuery = useQuery({
    queryKey: queryKeys.attractions({ scope: 'curator-recent', limit: 5 }),
    queryFn: () => attractionService.list({ limit: 5, sort: 'recently_updated' }),
    staleTime: 30_000,
  });

  if (overviewQuery.isError) {
    return (
      <ErrorState
        title="Unable to load the dashboard"
        message={overviewQuery.error?.message ?? 'Please try again.'}
        onRetry={() => overviewQuery.refetch()}
      />
    );
  }

  const stats = overviewQuery.data?.stats;
  const needsAttention = overviewQuery.data?.needsAttention;
  const categories = overviewQuery.data?.categories ?? [];
  const recent = recentQuery.data?.items ?? [];

  return (
    <div>
      <SectionHeading
        title="Catalogue overview"
        description={`Signed in as ${user.name}. Manage attractions, categories and location data.`}
        action={
          <ButtonLink to={`${basePath}/attractions/new`} variant="primary">
            <Icon name="plus" className="h-4 w-4" />
            Add attraction
          </ButtonLink>
        }
      />

      {/* Totals */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total attractions"
          value={stats?.totalAttractions}
          icon="compass"
          tone="cobalt"
          hint="Published in the catalogue"
        />
        <StatCard
          label="Categories"
          value={stats?.totalCategories}
          icon="layers"
          tone="cobalt"
          hint="Used for filtering"
        />
        <StatCard
          label="Added in 30 days"
          value={stats?.createdLast30Days}
          icon="trending-up"
          tone="cobalt"
          hint="Recent catalogue growth"
        />
        <StatCard
          label="Missing coordinates"
          value={stats?.unmappedAttractions}
          icon="map-pin"
          hint="Cannot be shown on a map"
        />
      </div>

      {/* Needs attention */}
      {needsAttention &&
      (needsAttention.attractionsWithoutCoordinates > 0 || needsAttention.emptyCategories > 0) ? (
        <Alert variant="warning" title="Worth reviewing" className="mt-6">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {needsAttention.attractionsWithoutCoordinates > 0 ? (
              <li>
                {needsAttention.attractionsWithoutCoordinates} attraction
                {needsAttention.attractionsWithoutCoordinates === 1 ? ' has' : 's have'} no coordinates.
                Open one and use <strong>Look up location</strong> to place it on the map.
              </li>
            ) : null}
            {needsAttention.emptyCategories > 0 ? (
              <li>
                {needsAttention.emptyCategories} categor
                {needsAttention.emptyCategories === 1 ? 'y classifies' : 'ies classify'} no
                attractions yet.
              </li>
            ) : null}
          </ul>
        </Alert>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Recently updated */}
        <section className="card overflow-hidden" aria-labelledby="recent-heading">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 p-5">
            <h2 id="recent-heading" className="text-base font-bold text-black">
              Recently updated
            </h2>
            <ButtonLink to={`${basePath}/attractions`} variant="ghost" size="sm">
              Manage all
              <Icon name="arrow-right" className="h-3.5 w-3.5" />
            </ButtonLink>
          </div>

          {recentQuery.isPending ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="skeleton h-14 w-full" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="p-5 text-sm text-neutral-600">
              No attractions yet. Add the first one to get started.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {recent.map((attraction) => {
                const hasCoordinates =
                  typeof attraction.latitude === 'number' &&
                  typeof attraction.longitude === 'number';

                return (
                  <li key={attraction.id} className="flex items-center gap-3 p-4">
                    <SafeImage
                      src={attraction.imageUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/attractions/${attraction.id}`}
                        className="block truncate text-sm font-semibold text-black hover:text-cobalt-700"
                      >
                        {attraction.name}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
                        <span>{attraction.category.name}</span>
                        <span aria-hidden="true">·</span>
                        <span>Updated {formatDate(attraction.updatedAt)}</span>
                      </p>
                    </div>

                    {hasCoordinates ? (
                      <Badge variant="success" icon="check">
                        Mapped
                      </Badge>
                    ) : (
                      <Badge variant="warning" icon="alert-triangle">
                        No location
                      </Badge>
                    )}

                    <ButtonLink
                      to={`${basePath}/attractions/${attraction.id}/edit`}
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${attraction.name}`}
                    >
                      <Icon name="pencil" className="h-4 w-4" />
                    </ButtonLink>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Categories */}
        <section className="card overflow-hidden" aria-labelledby="categories-heading">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 p-5">
            <h2 id="categories-heading" className="text-base font-bold text-black">
              Categories
            </h2>
            <ButtonLink to={`${basePath}/categories`} variant="ghost" size="sm">
              Manage
              <Icon name="arrow-right" className="h-3.5 w-3.5" />
            </ButtonLink>
          </div>

          {overviewQuery.isPending ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="skeleton h-8 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {categories.map((category) => (
                <li
                  key={category.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <Link
                    to={`/attractions?category=${encodeURIComponent(category.slug)}`}
                    className="truncate text-sm font-medium text-black hover:text-cobalt-700"
                  >
                    {category.name}
                  </Link>
                  <span className="shrink-0 text-sm font-semibold text-neutral-500">
                    {category.attractionCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default CuratorOverviewPage;
