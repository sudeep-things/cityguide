/**
 * Saved places.
 *
 * The shortlist is entirely server-backed: removing a place here deletes the
 * `saved_places` row, and the unique (user_id, attraction_id) constraint means
 * the same place can never appear twice.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { savedPlaceService } from '../services/resources.js';
import { queryKeys } from '../services/queryKeys.js';
import { useDocumentTitle } from '../hooks/useApp.js';
import { useToast } from '../context/ToastContext.jsx';
import { AddToItineraryDialog } from '../components/attractions/AddToItineraryDialog.jsx';
import { AttractionCard } from '../components/attractions/AttractionCard.jsx';
import {
  Button,
  ButtonLink,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  Pagination,
  SectionHeading,
  SkeletonGrid,
} from '../components/ui/index.js';

export function SavedPlacesPage() {
  useDocumentTitle('Saved places');

  const toast = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [itineraryTarget, setItineraryTarget] = useState(null);

  const params = { page, limit: 12 };

  const savedQuery = useQuery({
    queryKey: queryKeys.savedPlaces(params),
    queryFn: () => savedPlaceService.list(params),
    placeholderData: (previous) => previous,
  });

  const items = savedQuery.data?.items ?? [];
  const pagination = savedQuery.data?.pagination ?? null;

  const removeMutation = useMutation({
    mutationFn: (attractionId) => savedPlaceService.removeByAttraction(attractionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-places'] });
      queryClient.invalidateQueries({ queryKey: ['attractions'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Removed from your saved places.');
      setPendingRemoval(null);
    },
    onError: (error) => {
      toast.error(error?.message ?? 'We could not remove that saved place.');
      setPendingRemoval(null);
    },
  });

  return (
    <div className="container-page py-8 sm:py-10">
      <SectionHeading
        level={1}
        title="Saved places"
        description="Everything you have bookmarked, newest first. Add any of them straight into an itinerary."
        action={
          <ButtonLink to="/attractions" variant="outline" size="sm">
            <Icon name="search" className="h-4 w-4" />
            Find more places
          </ButtonLink>
        }
      />

      <div className="mt-8">
        {savedQuery.isPending ? (
          <SkeletonGrid count={3} />
        ) : savedQuery.isError ? (
          <ErrorState
            title="Unable to load your saved places"
            message={savedQuery.error?.message ?? 'Please try again.'}
            onRetry={() => savedQuery.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon="bookmark"
            title="No saved places yet"
            description="Tap the bookmark icon on any attraction to keep it here for later."
            action={
              <ButtonLink to="/attractions" variant="primary">
                Browse attractions
              </ButtonLink>
            }
          />
        ) : (
          <>
            <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((entry) => (
                <li key={entry.id} className="flex flex-col">
                  <AttractionCard attraction={entry.attraction} />

                  {/* Saved-place specific actions */}
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setItineraryTarget(entry.attraction)}
                    >
                      <Icon name="plus" className="h-4 w-4" />
                      Add to itinerary
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingRemoval(entry.attraction)}
                      aria-label={`Remove ${entry.attraction.name} from saved places`}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {pagination ? (
              <Pagination
                className="mt-10"
                pagination={pagination}
                onPageChange={(next) => {
                  setPage(next);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                itemLabel="saved places"
              />
            ) : null}
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        onConfirm={() => removeMutation.mutate(pendingRemoval.id)}
        loading={removeMutation.isPending}
        title="Remove this saved place?"
        message={`“${pendingRemoval?.name}” will be removed from your shortlist. Any itinerary that already contains it is not affected.`}
        confirmLabel="Remove"
      />

      <AddToItineraryDialog
        attraction={itineraryTarget ?? { id: 0, name: '' }}
        open={Boolean(itineraryTarget)}
        onClose={() => setItineraryTarget(null)}
      />
    </div>
  );
}

export default SavedPlacesPage;
