/**
 * Attractions discovery page.
 *
 * Filter state lives in the URL, so a filtered view is shareable, survives a
 * refresh, and works with the browser back button. React Query keeps the
 * previous page's data visible while the next one loads, which avoids the layout
 * jumping on every keystroke.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { attractionService, categoryService } from '../services/resources.js';
import { queryKeys } from '../services/queryKeys.js';
import { useDocumentTitle } from '../hooks/useApp.js';
import { AttractionFilters } from '../components/attractions/AttractionFilters.jsx';
import { AttractionGrid } from '../components/attractions/AttractionGrid.jsx';
import { Icon, Pagination, SectionHeading } from '../components/ui/index.js';

const PAGE_SIZE = 12;

export function AttractionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const category = searchParams.get('category') ?? '';
  const sort = searchParams.get('sort') ?? 'newest';
  const layout = searchParams.get('layout') === 'list' ? 'list' : 'grid';
  const page = Math.max(Number(searchParams.get('page')) || 1, 1);

  useDocumentTitle(
    search ? `“${search}” · Attractions` : category ? `${category} attractions` : 'Attractions',
  );

  const queryParams = useMemo(
    () => ({
      search: search || undefined,
      category: category || undefined,
      sort,
      page,
      limit: PAGE_SIZE,
    }),
    [search, category, sort, page],
  );

  const attractionsQuery = useQuery({
    queryKey: queryKeys.attractions(queryParams),
    queryFn: ({ signal }) => attractionService.list(queryParams, { signal }),
    placeholderData: keepPreviousData,
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => categoryService.list(),
    staleTime: 5 * 60_000,
  });

  const attractions = attractionsQuery.data?.items ?? [];
  const pagination = attractionsQuery.data?.pagination ?? null;
  const categories = categoriesQuery.data?.items ?? [];

  const hasActiveFilters = Boolean(search || category || sort !== 'newest');

  /** Merges a patch into the URL, resetting to page 1 unless paging. */
  const updateFilters = useCallback(
    (patch) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === null || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          // Any filter change invalidates the current page number.
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const resetFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const goToPage = useCallback(
    (nextPage) => {
      updateFilters({ page: nextPage <= 1 ? undefined : nextPage });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [updateFilters],
  );

  return (
    <div className="container-page py-8 sm:py-10">
      <SectionHeading
        level={1}
        title="Attractions"
        description="Search the catalogue, filter by category and sort the results before opening anything."
      />

      <div className="mt-6">
        <AttractionFilters
          search={search}
          category={category}
          sort={sort}
          layout={layout}
          categories={categories}
          totalItems={pagination?.totalItems}
          isFetching={attractionsQuery.isFetching}
          hasActiveFilters={hasActiveFilters}
          onChange={updateFilters}
          onReset={resetFilters}
          onLayoutChange={(nextLayout) => updateFilters({ layout: nextLayout })}
        />
      </div>

      {/* Active filter summary */}
      {hasActiveFilters ? (
        <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Active filters
          </span>

          {search ? (
            <button
              type="button"
              onClick={() => updateFilters({ search: undefined })}
              className="badge badge-cobalt gap-1.5 hover:bg-cobalt-100"
            >
              Search: {search}
              <Icon name="close" className="h-3 w-3" />
              <span className="sr-only">Remove search filter</span>
            </button>
          ) : null}

          {category ? (
            <button
              type="button"
              onClick={() => updateFilters({ category: undefined })}
              className="badge badge-cobalt gap-1.5 capitalize hover:bg-cobalt-100"
            >
              Category: {category}
              <Icon name="close" className="h-3 w-3" />
              <span className="sr-only">Remove category filter</span>
            </button>
          ) : null}

          {sort !== 'newest' ? (
            <button
              type="button"
              onClick={() => updateFilters({ sort: undefined })}
              className="badge badge-neutral gap-1.5 hover:bg-neutral-200"
            >
              Sorted: {sort.replace(/_/g, ' ')}
              <Icon name="close" className="h-3 w-3" />
              <span className="sr-only">Reset sorting</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6">
        <AttractionGrid
          attractions={attractions}
          // Small screens always use the stacked list layout.
          layout={layout}
          isLoading={attractionsQuery.isPending}
          isError={attractionsQuery.isError}
          error={attractionsQuery.error}
          onRetry={() => attractionsQuery.refetch()}
          onResetFilters={resetFilters}
          hasActiveFilters={hasActiveFilters}
          skeletonCount={PAGE_SIZE}
          emptyTitle={search ? `No attractions match “${search}”` : 'No attractions found'}
        />
      </div>

      {pagination && pagination.totalItems > 0 ? (
        <Pagination
          className="mt-10"
          pagination={pagination}
          onPageChange={goToPage}
          itemLabel="attractions"
        />
      ) : null}
    </div>
  );
}

export default AttractionsPage;
