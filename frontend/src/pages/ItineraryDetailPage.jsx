/**
 * Itinerary builder.
 *
 * The order shown here is the order stored in `itinerary_items.position`. Two
 * reordering mechanisms are offered:
 *
 *   * Move up / move down buttons — keyboard accessible and reliable on touch,
 *     and therefore the primary control;
 *   * drag and drop — a convenience for pointer users.
 *
 * Both funnel into `commitOrder`, which updates the view optimistically and then
 * persists the complete order through the API. The request is debounced so a
 * burst of clicks results in one write, and the server rejects any payload that
 * does not describe the full set of stops.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { attractionService, itineraryService } from '../services/resources.js';
import { queryKeys } from '../services/queryKeys.js';
import { useDocumentTitle } from '../hooks/useApp.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  InlineError,
  Modal,
  SafeImage,
  Skeleton,
  Spinner,
  TextField,
} from '../components/ui/index.js';
import { copyToClipboard, distanceInKm, formatDistance, classNames } from '../utils/format.js';

const PERSIST_DELAY_MS = 450;

/* -------------------------------------------------------------------------- */
/* Add-stop picker                                                             */
/* -------------------------------------------------------------------------- */

function AddStopDialog({ itineraryId, existingAttractionIds, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term.trim()), 300);
    return () => clearTimeout(timer);
  }, [term]);

  const searchQuery = useQuery({
    queryKey: queryKeys.attractions({ search: debouncedTerm, limit: 8, picker: true }),
    queryFn: () => attractionService.list({ search: debouncedTerm || undefined, limit: 8 }),
    staleTime: 30_000,
  });

  const results = searchQuery.data?.items ?? [];

  const addMutation = useMutation({
    mutationFn: (attractionId) => itineraryService.addItem(itineraryId, { attractionId }),
    onSuccess: (data, attractionId) => {
      queryClient.setQueryData(queryKeys.itinerary(itineraryId), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.itineraries });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      const name = results.find((item) => item.id === attractionId)?.name ?? 'Stop';
      toast.success(`Added “${name}” to the end of your itinerary.`);
    },
    onError: (error) => {
      toast.error(error?.message ?? 'We could not add that stop.');
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a stop"
      description="New stops are appended to the end — reorder them afterwards."
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      }
    >
      <TextField
        label="Search attractions"
        placeholder="Search by name, description or address"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        autoFocus
        autoComplete="off"
      />

      <div className="mt-4">
        {searchQuery.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : searchQuery.isError ? (
          <ErrorState
            title="Unable to search attractions"
            message={searchQuery.error?.message}
            onRetry={() => searchQuery.refetch()}
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon="search"
            title="No attractions found"
            description="Try a different search term."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {results.map((attraction) => {
              const alreadyAdded = existingAttractionIds.has(attraction.id);
              return (
                <li key={attraction.id} className="flex items-center gap-3 py-3">
                  <SafeImage
                    src={attraction.imageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-black">{attraction.name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {attraction.category.name} · {attraction.address}
                    </p>
                  </div>
                  <Button
                    variant={alreadyAdded ? 'ghost' : 'outline'}
                    size="sm"
                    disabled={alreadyAdded || addMutation.isPending}
                    onClick={() => addMutation.mutate(attraction.id)}
                  >
                    {alreadyAdded ? (
                      <>
                        <Icon name="check" className="h-3.5 w-3.5" />
                        Added
                      </>
                    ) : (
                      <>
                        <Icon name="plus" className="h-3.5 w-3.5" />
                        Add
                      </>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export function ItineraryDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [optimisticItems, setOptimisticItems] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const persistTimer = useRef(null);
  const pendingOrder = useRef(null);

  const itineraryQuery = useQuery({
    queryKey: queryKeys.itinerary(id),
    queryFn: () => itineraryService.get(id),
    retry: false,
  });

  const itinerary = itineraryQuery.data?.itinerary ?? null;
  const serverItems = itineraryQuery.data?.items ?? [];

  useDocumentTitle(itinerary?.name ?? 'Itinerary');

  const items = optimisticItems ?? serverItems;

  // Once the server confirms a new order, stop overriding it locally.
  useEffect(() => {
    setOptimisticItems(null);
  }, [itineraryQuery.dataUpdatedAt]);

  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);

  const reorderMutation = useMutation({
    mutationFn: (itemIds) => itineraryService.reorder(id, itemIds),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.itinerary(id), data);
      setOptimisticItems(null);
    },
    onError: (error) => {
      // Drop the optimistic order so the list snaps back to what is stored.
      setOptimisticItems(null);
      pendingOrder.current = null;
      toast.error(error?.message ?? 'We could not save the new order.');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (itemId) => itineraryService.removeItem(id, itemId),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.itinerary(id), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.itineraries });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      toast.success('Stop removed.');
    },
    onError: (error) => {
      toast.error(error?.message ?? 'We could not remove that stop.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => itineraryService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.itineraries });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      toast.success('Itinerary deleted.');
      window.location.assign('/itineraries');
    },
    onError: (error) => {
      toast.error(error?.message ?? 'We could not delete that itinerary.');
      setConfirmDelete(false);
    },
  });

  /** Applies a new order to the view and schedules one persistence request. */
  const commitOrder = useCallback(
    (nextItems, announcementText) => {
      setOptimisticItems(nextItems);
      pendingOrder.current = nextItems.map((item) => item.id);

      if (announcementText) setAnnouncement(announcementText);

      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        const ids = pendingOrder.current;
        if (ids && ids.length > 0) reorderMutation.mutate(ids);
      }, PERSIST_DELAY_MS);
    },
    [reorderMutation],
  );

  const moveItem = useCallback(
    (index, direction) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return;

      const next = [...items];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);

      commitOrder(
        next,
        `${moved.attraction.name} moved to position ${target + 1} of ${next.length}.`,
      );
    },
    [items, commitOrder],
  );

  /** Drag and drop: move the dragged row to the hovered position. */
  const handleDrop = useCallback(
    (targetIndex) => {
      if (dragIndex === null || dragIndex === targetIndex) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }

      const next = [...items];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);

      commitOrder(
        next,
        `${moved.attraction.name} moved to position ${targetIndex + 1} of ${next.length}.`,
      );

      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, items, commitOrder],
  );

  /** Total walking distance between consecutive stops that have coordinates. */
  const totalDistance = useMemo(() => {
    let sum = 0;
    let legs = 0;
    for (let index = 1; index < items.length; index += 1) {
      const leg = distanceInKm(items[index - 1].attraction, items[index].attraction);
      if (leg !== null) {
        sum += leg;
        legs += 1;
      }
    }
    return { sum, legs };
  }, [items]);

  // Authorization failure (someone else's private plan) is reported distinctly.
  if (itineraryQuery.isError) {
    const forbiddenError = itineraryQuery.error?.status === 403;
    const missing = itineraryQuery.error?.status === 404;

    return (
      <div className="container-page py-16">
        <ErrorState
          title={
            forbiddenError
              ? 'This itinerary belongs to another traveler'
              : missing
                ? 'Itinerary not found'
                : 'Unable to load this itinerary'
          }
          message={
            forbiddenError
              ? 'You do not have permission to view this itinerary. Itineraries are private to their owner.'
              : (itineraryQuery.error?.message ?? 'Please try again.')
          }
          onRetry={forbiddenError || missing ? undefined : () => itineraryQuery.refetch()}
        />
        <div className="mt-6 text-center">
          <ButtonLink to="/itineraries" variant="primary">
            Back to my itineraries
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (itineraryQuery.isPending) {
    return (
      <div className="container-page py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const existingAttractionIds = new Set(items.map((item) => item.attraction.id));

  async function handleCopyPlan() {
    const lines = [
      itinerary.name,
      itinerary.description ? `\n${itinerary.description}` : '',
      '',
      ...items.map((item, index) => `${index + 1}. ${item.attraction.name} — ${item.attraction.address}`),
    ];

    const copied = await copyToClipboard(lines.join('\n'));
    if (copied) toast.success('Itinerary copied to your clipboard.');
    else toast.error('Your browser blocked the clipboard. You can still print the page.');
  }

  return (
    <div className="container-page py-8">
      {/* Header ---------------------------------------------------------- */}
      <nav aria-label="Breadcrumb" className="mb-5">
        <ol className="flex items-center gap-1.5 text-sm text-neutral-500">
          <li>
            <Link to="/itineraries" className="hover:text-cobalt-700">
              My itineraries
            </Link>
          </li>
          <li aria-hidden="true">
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </li>
          <li className="font-medium text-black" aria-current="page">
            {itinerary.name}
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-black">{itinerary.name}</h1>
          {itinerary.description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
              {itinerary.description}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="cobalt" icon="route">
              {items.length} {items.length === 1 ? 'stop' : 'stops'}
            </Badge>
            {totalDistance.legs > 0 ? (
              <Badge variant="neutral" icon="compass">
                ≈ {formatDistance(totalDistance.sum)} between stops
              </Badge>
            ) : null}
            {reorderMutation.isPending ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                <Spinner className="h-3.5 w-3.5 text-cobalt-600" />
                Saving order…
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setAddStopOpen(true)}>
            <Icon name="plus" className="h-4 w-4" />
            Add stop
          </Button>
          <Button variant="outline" onClick={handleCopyPlan} disabled={items.length === 0}>
            <Icon name="list" className="h-4 w-4" />
            Copy plan
          </Button>
          <Button
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete ${itinerary.name}`}
          >
            <Icon name="trash" className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Reorder announcement for assistive technology */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {/* Stop list ------------------------------------------------------- */}
      <div className="mt-8">
        {items.length === 0 ? (
          <EmptyState
            icon="route"
            title="Your itinerary is empty"
            description="Add attractions to build your day plan. You can reorder them at any time."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="primary" onClick={() => setAddStopOpen(true)}>
                  <Icon name="plus" className="h-4 w-4" />
                  Add your first stop
                </Button>
                <ButtonLink to="/attractions" variant="outline">
                  Browse attractions
                </ButtonLink>
              </div>
            }
          />
        ) : (
          <>
            <Alert variant="info" className="mb-5">
              Use the up and down buttons to reorder stops, or drag a row. The order is saved to your
              account automatically.
            </Alert>

            <ol className="space-y-3">
              {items.map((item, index) => {
                const previous = index > 0 ? items[index - 1].attraction : null;
                const legDistance = previous
                  ? distanceInKm(previous, item.attraction)
                  : null;

                return (
                  <li
                    key={item.id}
                    draggable
                    onDragStart={(event) => {
                      setDragIndex(index);
                      event.dataTransfer.effectAllowed = 'move';
                      // Firefox requires data to be set for a drag to start.
                      event.dataTransfer.setData('text/plain', String(item.id));
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      if (dragOverIndex !== index) setDragOverIndex(index);
                    }}
                    onDragLeave={() => setDragOverIndex((current) => (current === index ? null : current))}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop(index);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    className={classNames(
                      'card flex flex-col gap-4 p-4 transition-shadow sm:flex-row sm:items-center',
                      dragIndex === index && 'opacity-50',
                      dragOverIndex === index && dragIndex !== index
                        ? 'ring-2 ring-cobalt-500'
                        : '',
                    )}
                  >
                    {/* Position + drag handle */}
                    <div className="flex items-center gap-3 sm:flex-col sm:gap-1">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cobalt-600 text-sm font-bold text-white"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <span
                        className="hidden cursor-grab text-neutral-300 sm:block"
                        title="Drag to reorder"
                        aria-hidden="true"
                      >
                        <Icon name="list" className="h-4 w-4" />
                      </span>
                    </div>

                    <SafeImage
                      src={item.attraction.imageUrl}
                      alt=""
                      className="h-28 w-full shrink-0 rounded-lg sm:h-20 sm:w-28"
                      loading="lazy"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="neutral">{item.attraction.category.name}</Badge>
                        {legDistance !== null ? (
                          <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                            <Icon name="arrow-down" className="h-3 w-3" />
                            {formatDistance(legDistance)} from previous
                          </span>
                        ) : null}
                      </div>

                      <h2 className="mt-1.5 text-base font-bold leading-6 text-black">
                        <Link
                          to={`/attractions/${item.attraction.id}`}
                          className="hover:text-cobalt-700"
                        >
                          {item.attraction.name}
                        </Link>
                      </h2>

                      <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-neutral-500">
                        <Icon name="map-pin" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cobalt-600" />
                        <span className="clamp-2">{item.attraction.address}</span>
                      </p>
                    </div>

                    {/* Controls */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => moveItem(index, -1)}
                          disabled={index === 0}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 text-black transition-colors hover:border-cobalt-600 hover:text-cobalt-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-black"
                          aria-label={`Move ${item.attraction.name} up`}
                        >
                          <Icon name="chevron-up" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(index, 1)}
                          disabled={index === items.length - 1}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 text-black transition-colors hover:border-cobalt-600 hover:text-cobalt-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-black"
                          aria-label={`Move ${item.attraction.name} down`}
                        >
                          <Icon name="chevron-down" className="h-4 w-4" />
                        </button>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMutation.mutate(item.id)}
                        disabled={removeMutation.isPending}
                        aria-label={`Remove ${item.attraction.name} from this itinerary`}
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-5">
              <p className="text-sm text-neutral-600">
                That is {items.length} {items.length === 1 ? 'stop' : 'stops'}
                {totalDistance.legs > 0
                  ? ` covering roughly ${formatDistance(totalDistance.sum)} as the crow flies`
                  : ''}
                . Distances are calculated from stored coordinates and are straight-line estimates, not
                walking routes.
              </p>
            </div>
          </>
        )}
      </div>

      {addStopOpen ? (
        <AddStopDialog
          itineraryId={id}
          existingAttractionIds={existingAttractionIds}
          onClose={() => setAddStopOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        title="Delete this itinerary?"
        message={`“${itinerary.name}” and its ${items.length} stop(s) will be permanently deleted. The attractions themselves are not affected.`}
        confirmLabel="Delete itinerary"
      />

      {reorderMutation.isError ? (
        <div className="mt-4">
          <InlineError>{reorderMutation.error?.message}</InlineError>
        </div>
      ) : null}
    </div>
  );
}

export default ItineraryDetailPage;
