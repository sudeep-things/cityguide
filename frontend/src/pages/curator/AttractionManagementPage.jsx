/**
 * Curator attraction management.
 *
 * A dense table for cataloguing work: search, filter, edit, delete and a direct
 * link to the public page. Shared with the administrator dashboard via a
 * `basePath` prop so the two areas stay consistent.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { attractionService, categoryService } from '../../services/resources.js';
import { queryKeys } from '../../services/queryKeys.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useDocumentTitle, useDebounce } from '../../hooks/useApp.js';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  Pagination,
  SafeImage,
  SectionHeading,
  SelectField,
  SkeletonRows,
  TableWrapper,
  TextField,
} from '../../components/ui/index.js';
import { formatDate } from '../../utils/format.js';

const PAGE_SIZE = 15;

export function AttractionManagementPage({ basePath = '/curator' }) {
  useDocumentTitle('Manage attractions');

  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const category = searchParams.get('category') ?? '';
  const page = Math.max(Number(searchParams.get('page')) || 1, 1);

  const [searchDraft, setSearchDraft] = useState(search);
  const debouncedSearch = useDebounce(searchDraft, 350);
  const [pendingDelete, setPendingDelete] = useState(null);

  // Publish the debounced term into the URL. Runs as an effect (never during
  // render) so navigation happens after the keystroke has settled.
  useEffect(() => {
    if (debouncedSearch === search) return;

    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set('search', debouncedSearch);
    else next.delete('search');
    next.delete('page');
    setSearchParams(next, { replace: true });
    // Intentionally keyed on the debounced value only: including the other
    // values would re-run this effect on its own navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const params = {
    search: search || undefined,
    category: category || undefined,
    page,
    limit: PAGE_SIZE,
    sort: 'recently_updated',
  };

  const attractionsQuery = useQuery({
    queryKey: queryKeys.attractions({ ...params, scope: 'management' }),
    queryFn: ({ signal }) => attractionService.list(params, { signal }),
    placeholderData: keepPreviousData,
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => categoryService.list(),
    staleTime: 5 * 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => attractionService.remove(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['attractions'] });
      queryClient.invalidateQueries({ queryKey: ['curator'] });
      queryClient.invalidateQueries({ queryKey: ['admin'] });

      const removed = data?.deleted;
      toast.success(
        removed
          ? `Deleted “${removed.name}”. ${removed.removedSavedPlaces} saved place(s) and ${removed.removedItineraryItems} itinerary stop(s) were removed.`
          : 'Attraction deleted.',
      );
      setPendingDelete(null);
    },
    onError: (error) => {
      toast.error(error?.message ?? 'We could not delete that attraction.');
      setPendingDelete(null);
    },
  });

  const items = attractionsQuery.data?.items ?? [];
  const pagination = attractionsQuery.data?.pagination ?? null;
  const categories = categoriesQuery.data?.items ?? [];
  const hasFilters = Boolean(search || category);

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
        title="Attractions"
        description="Create, edit and remove entries in the public catalogue."
        action={
          <ButtonLink to={`${basePath}/attractions/new`} variant="primary">
            <Icon name="plus" className="h-4 w-4" />
            Add attraction
          </ButtonLink>
        }
      />

      {/* Filters */}
      <div className="card mt-6 p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <TextField
            label="Search"
            placeholder="Name, description or address"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            autoComplete="off"
          />

          <SelectField
            label="Category"
            value={category}
            onChange={(event) => updateParam('category', event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((entry) => (
              <option key={entry.id} value={entry.slug}>
                {entry.name}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <p className="text-sm text-neutral-600">
            {pagination ? (
              <>
                <span className="font-semibold text-black">{pagination.totalItems}</span> attraction
                {pagination.totalItems === 1 ? '' : 's'}
                {hasFilters ? ' match your filters' : ' in the catalogue'}
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
        {attractionsQuery.isPending ? (
          <div className="p-6">
            <SkeletonRows count={6} />
          </div>
        ) : attractionsQuery.isError ? (
          <div className="p-6">
            <ErrorState
              title="Unable to load attractions"
              message={attractionsQuery.error?.message ?? 'Please try again.'}
              onRetry={() => attractionsQuery.refetch()}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={hasFilters ? 'search' : 'compass'}
              title={hasFilters ? 'No attractions match those filters' : 'No attractions yet'}
              description={
                hasFilters
                  ? 'Try a different search term or clear the filters.'
                  : 'Add the first attraction to start building the catalogue.'
              }
              action={
                hasFilters ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchDraft('');
                      setSearchParams({}, { replace: true });
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <ButtonLink to={`${basePath}/attractions/new`} variant="primary">
                    <Icon name="plus" className="h-4 w-4" />
                    Add attraction
                  </ButtonLink>
                )
              }
            />
          </div>
        ) : (
          <TableWrapper>
            <table className="table">
              <caption className="sr-only">Attractions in the catalogue</caption>
              <thead>
                <tr>
                  <th scope="col">Attraction</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="hidden md:table-cell">
                    Location
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Updated
                  </th>
                  <th scope="col" className="text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((attraction) => {
                  const hasCoordinates =
                    typeof attraction.latitude === 'number' &&
                    typeof attraction.longitude === 'number';

                  return (
                    <tr key={attraction.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <SafeImage
                            src={attraction.imageUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg"
                          />
                          <div className="min-w-0">
                            <Link
                              to={`/attractions/${attraction.id}`}
                              className="block truncate text-sm font-semibold text-black hover:text-cobalt-700"
                            >
                              {attraction.name}
                            </Link>
                            <span className="block truncate text-xs text-neutral-500">
                              {attraction.savedCount} saved
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <Badge variant="neutral">{attraction.category.name}</Badge>
                      </td>

                      <td className="hidden md:table-cell">
                        <span className="block max-w-xs truncate text-sm text-neutral-600">
                          {attraction.address}
                        </span>
                        {hasCoordinates ? (
                          <span className="mt-0.5 block font-mono text-xs text-neutral-400">
                            {attraction.latitude.toFixed(4)}, {attraction.longitude.toFixed(4)}
                          </span>
                        ) : (
                          <Badge variant="warning" className="mt-1">
                            No coordinates
                          </Badge>
                        )}
                      </td>

                      <td className="hidden whitespace-nowrap text-sm text-neutral-600 lg:table-cell">
                        {formatDate(attraction.updatedAt)}
                      </td>

                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <ButtonLink
                            to={`${basePath}/attractions/${attraction.id}/edit`}
                            variant="ghost"
                            size="sm"
                            aria-label={`Edit ${attraction.name}`}
                          >
                            <Icon name="pencil" className="h-4 w-4" />
                          </ButtonLink>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(attraction)}
                            aria-label={`Delete ${attraction.name}`}
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
          itemLabel="attractions"
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        loading={deleteMutation.isPending}
        title="Delete this attraction?"
        message={`“${pendingDelete?.name}” will be permanently removed from the catalogue. Any saved places and itinerary stops that reference it will also be deleted.`}
        confirmLabel="Delete attraction"
      />

      <Alert variant="info" className="mt-6">
        Deleting an attraction also removes it from every traveler's saved places and itineraries. The
        confirmation step exists because that cannot be undone.
      </Alert>
    </div>
  );
}

export default AttractionManagementPage;
