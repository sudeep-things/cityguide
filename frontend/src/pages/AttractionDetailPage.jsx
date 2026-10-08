/**
 * Attraction detail page.
 *
 * Everything the brief requires for a place is present: image, name, category,
 * description, address, coordinates, a map built from the stored coordinates,
 * the save action and the add-to-itinerary action.
 *
 * The map is deliberately rendered from data already in the database — opening
 * this page never triggers a geocoding request against Nominatim.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { attractionService } from '../services/resources.js';
import { queryKeys } from '../services/queryKeys.js';
import { useDocumentTitle } from '../hooks/useApp.js';
import { SaveButton } from '../components/attractions/SaveButton.jsx';
import { AddToItineraryDialog } from '../components/attractions/AddToItineraryDialog.jsx';
import { AttractionCard } from '../components/attractions/AttractionCard.jsx';
import { LocationMap } from '../components/map/LocationMap.jsx';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  DetailRow,
  ErrorState,
  Icon,
  SafeImage,
  SectionHeading,
  Skeleton,
  SkeletonGrid,
  SkeletonText,
} from '../components/ui/index.js';
import { formatCoordinates, formatDate } from '../utils/format.js';

function DetailSkeleton() {
  return (
    <div className="container-page py-8">
      <Skeleton className="h-4 w-48" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <Skeleton className="h-72 w-full rounded-xl sm:h-96" />
          <Skeleton className="mt-6 h-9 w-2/3" />
          <div className="mt-4">
            <SkeletonText lines={4} />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function AttractionDetailPage() {
  const { id } = useParams();
  const [itineraryDialogOpen, setItineraryDialogOpen] = useState(false);

  const attractionQuery = useQuery({
    queryKey: queryKeys.attraction(id),
    queryFn: ({ signal }) => attractionService.get(id, { signal }),
    retry: false,
  });

  const attraction = attractionQuery.data?.attraction ?? null;

  useDocumentTitle(attraction?.name ?? 'Attraction');

  // Related places come from the same category, excluding this one.
  const relatedQuery = useQuery({
    queryKey: queryKeys.attractions({ category: attraction?.category?.slug, limit: 4, relatedTo: id }),
    queryFn: ({ signal }) =>
      attractionService.list(
        { category: attraction.category.slug, limit: 4, sort: 'name_asc' },
        { signal },
      ),
    enabled: Boolean(attraction?.category?.slug),
    staleTime: 60_000,
  });

  if (attractionQuery.isPending) return <DetailSkeleton />;

  if (attractionQuery.isError) {
    const isMissing = attractionQuery.error?.status === 404;
    return (
      <div className="container-page py-16">
        <ErrorState
          title={isMissing ? 'Attraction not found' : 'Unable to load this attraction'}
          message={
            isMissing
              ? 'That attraction could not be found. It may have been removed.'
              : (attractionQuery.error?.message ?? 'Please try again.')
          }
          onRetry={isMissing ? undefined : () => attractionQuery.refetch()}
        />
        <div className="mt-6 text-center">
          <ButtonLink to="/attractions" variant="primary">
            Back to attractions
          </ButtonLink>
        </div>
      </div>
    );
  }

  const coordinates = formatCoordinates(attraction.latitude, attraction.longitude);
  const hasCoordinates = coordinates !== null;

  const related = (relatedQuery.data?.items ?? [])
    .filter((item) => item.id !== attraction.id)
    .slice(0, 3);

  return (
    <div className="container-page py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-5">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-500">
          <li>
            <Link to="/" className="hover:text-cobalt-700">
              Home
            </Link>
          </li>
          <li aria-hidden="true">
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </li>
          <li>
            <Link to="/attractions" className="hover:text-cobalt-700">
              Attractions
            </Link>
          </li>
          <li aria-hidden="true">
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </li>
          <li>
            <Link
              to={`/attractions?category=${encodeURIComponent(attraction.category.slug)}`}
              className="hover:text-cobalt-700"
            >
              {attraction.category.name}
            </Link>
          </li>
          <li aria-hidden="true">
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </li>
          <li className="font-medium text-black" aria-current="page">
            {attraction.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Main column --------------------------------------------------- */}
        <div className="min-w-0">
          <SafeImage
            src={attraction.imageUrl}
            alt={`${attraction.name}, ${attraction.category.name}`}
            className="h-72 w-full rounded-xl sm:h-96"
            fallbackLabel={attraction.name}
            loading="eager"
          />

          <div className="mt-6">
            <Badge variant="cobalt">{attraction.category.name}</Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-black sm:text-4xl">
              {attraction.name}
            </h1>
          </div>

          <section className="mt-6" aria-labelledby="about-heading">
            <h2 id="about-heading" className="text-lg font-bold text-black">
              About this place
            </h2>
            <p className="mt-3 whitespace-pre-line text-base leading-7 text-neutral-700">
              {attraction.description}
            </p>
          </section>

          {/* Location ---------------------------------------------------- */}
          <section className="mt-10" aria-labelledby="location-heading">
            <h2 id="location-heading" className="text-lg font-bold text-black">
              Location
            </h2>

            <dl className="mt-3">
              <DetailRow label="Address" icon="map-pin">
                {attraction.address}
              </DetailRow>
              <DetailRow label="Coordinates" icon="compass">
                {hasCoordinates ? (
                  <span className="font-mono text-sm text-neutral-700">{coordinates}</span>
                ) : (
                  <span className="text-neutral-500">
                    Not recorded yet — a curator can look up this address to place it on the map.
                  </span>
                )}
              </DetailRow>
              <DetailRow label="Category" icon="layers">
                <Link
                  to={`/attractions?category=${encodeURIComponent(attraction.category.slug)}`}
                  className="link"
                >
                  {attraction.category.name}
                </Link>
              </DetailRow>
            </dl>

            <div className="mt-5">
              {hasCoordinates ? (
                <LocationMap
                  latitude={attraction.latitude}
                  longitude={attraction.longitude}
                  label={attraction.name}
                  address={attraction.address}
                  className="h-80 w-full"
                />
              ) : (
                <Alert variant="info" title="No map available">
                  This attraction has no stored coordinates, so there is nothing to plot. Coordinates
                  are only ever added through a curator-triggered address lookup.
                </Alert>
              )}
            </div>
          </section>

          {/* Attribution ------------------------------------------------- */}
          <p className="mt-6 text-xs leading-5 text-neutral-500">
            Photograph and description sourced from{' '}
            <a
              href="https://www.wikipedia.org/"
              target="_blank"
              rel="noreferrer noopener"
              className="link text-xs"
            >
              Wikipedia
            </a>{' '}
            and Wikimedia Commons, available under CC BY-SA. Map data ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer noopener"
              className="link text-xs"
            >
              OpenStreetMap
            </a>{' '}
            contributors.
          </p>
        </div>

        {/* Sidebar ------------------------------------------------------- */}
        <aside className="min-w-0">
          <div className="card sticky top-24 p-5">
            <h2 className="text-base font-bold text-black">Plan your visit</h2>
            <p className="mt-1.5 text-sm leading-6 text-neutral-600">
              Save this place to your shortlist, or add it straight into an itinerary.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <Button variant="primary" block onClick={() => setItineraryDialogOpen(true)}>
                <Icon name="plus" className="h-4 w-4" />
                Add to itinerary
              </Button>
              <SaveButton attraction={attraction} variant="button" className="w-full" />
            </div>

            <dl className="mt-5 border-t border-neutral-100 pt-4">
              <div className="flex items-center justify-between py-1.5 text-sm">
                <dt className="text-neutral-600">Saved by</dt>
                <dd className="font-semibold text-black">
                  {attraction.savedCount} {attraction.savedCount === 1 ? 'traveler' : 'travelers'}
                </dd>
              </div>
              {attraction.createdBy ? (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <dt className="text-neutral-600">Added by</dt>
                  <dd className="font-semibold text-black">{attraction.createdBy.name}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between py-1.5 text-sm">
                <dt className="text-neutral-600">Listed</dt>
                <dd className="font-semibold text-black">{formatDate(attraction.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <dt className="text-neutral-600">Updated</dt>
                <dd className="font-semibold text-black">{formatDate(attraction.updatedAt)}</dd>
              </div>
            </dl>

            {attraction.isSaved ? (
              <p className="mt-4 flex items-center gap-2 rounded-lg bg-cobalt-50 px-3 py-2 text-sm font-medium text-cobalt-700">
                <Icon name="check" className="h-4 w-4" />
                In your saved places
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {/* Related --------------------------------------------------------- */}
      <section className="mt-16" aria-labelledby="related-heading">
        <SectionHeading
          title={`More in ${attraction.category.name}`}
          action={
            <ButtonLink
              to={`/attractions?category=${encodeURIComponent(attraction.category.slug)}`}
              variant="outline"
              size="sm"
            >
              See all
            </ButtonLink>
          }
        />
        <h2 id="related-heading" className="sr-only">
          Related attractions
        </h2>

        <div className="mt-6">
          {relatedQuery.isPending ? (
            <SkeletonGrid count={3} />
          ) : related.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <AttractionCard key={item.id} attraction={item} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-600">
              No other attractions in this category yet.
            </p>
          )}
        </div>
      </section>

      <AddToItineraryDialog
        attraction={attraction}
        open={itineraryDialogOpen}
        onClose={() => setItineraryDialogOpen(false)}
      />
    </div>
  );
}

export default AttractionDetailPage;
