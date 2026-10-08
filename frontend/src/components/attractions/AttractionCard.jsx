/**
 * Attraction card.
 *
 * Two layouts share one component: a grid card for browsing and a horizontal
 * row for the list view. Both are fully keyboard reachable — the whole card is
 * not a single link, so inner controls (save, add to itinerary) remain
 * separately focusable.
 */
import { Link } from 'react-router-dom';

import { SaveButton } from './SaveButton.jsx';
import { Badge, ButtonLink, Icon, SafeImage } from '../ui/index.js';
import { classNames } from '../../utils/format.js';

function MetaRow({ icon, children, className }) {
  return (
    <p className={classNames('flex items-start gap-1.5 text-xs leading-5 text-neutral-500', className)}>
      <Icon name={icon} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cobalt-600" />
      <span className="clamp-2">{children}</span>
    </p>
  );
}

export function AttractionCard({ attraction, layout = 'grid', eager = false }) {
  const detailPath = `/attractions/${attraction.id}`;
  const hasCoordinates =
    typeof attraction.latitude === 'number' && typeof attraction.longitude === 'number';

  if (layout === 'list') {
    return (
      <article className="card card-interactive flex flex-col overflow-hidden sm:flex-row">
        <Link
          to={detailPath}
          className="block shrink-0 sm:w-56"
          tabIndex={-1}
          aria-hidden="true"
        >
          <SafeImage
            src={attraction.imageUrl}
            alt=""
            className="h-40 w-full sm:h-full sm:min-h-40"
            fallbackLabel={attraction.name}
            loading={eager ? 'eager' : 'lazy'}
          />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Badge variant="cobalt">{attraction.category.name}</Badge>
              <h3 className="mt-2 text-base font-bold leading-6 tracking-tight text-black">
                <Link to={detailPath} className="hover:text-cobalt-700">
                  {attraction.name}
                </Link>
              </h3>
            </div>
            <SaveButton attraction={attraction} />
          </div>

          <p className="clamp-2 mt-2 text-sm leading-6 text-neutral-600">
            {attraction.description}
          </p>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            <MetaRow icon="map-pin">{attraction.address}</MetaRow>
            {hasCoordinates ? (
              <MetaRow icon="compass" className="hidden sm:flex">
                {attraction.latitude.toFixed(4)}, {attraction.longitude.toFixed(4)}
              </MetaRow>
            ) : (
              <MetaRow icon="compass" className="hidden sm:flex">
                Location not recorded
              </MetaRow>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 pt-1">
            <ButtonLink to={detailPath} variant="outline" size="sm">
              View details
            </ButtonLink>
            {attraction.savedCount > 0 ? (
              <span className="text-xs text-neutral-500">
                Saved by {attraction.savedCount}{' '}
                {attraction.savedCount === 1 ? 'traveler' : 'travelers'}
              </span>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="card card-interactive group flex flex-col overflow-hidden">
      <div className="relative">
        <Link to={detailPath} tabIndex={-1} aria-hidden="true" className="block">
          <SafeImage
            src={attraction.imageUrl}
            alt=""
            className="h-44 w-full"
            fallbackLabel={attraction.name}
            loading={eager ? 'eager' : 'lazy'}
          />
        </Link>

        <div className="absolute left-3 top-3">
          <Badge variant="cobalt" className="shadow-sm">
            {attraction.category.name}
          </Badge>
        </div>

        <div className="absolute right-3 top-3">
          <SaveButton attraction={attraction} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-bold leading-6 tracking-tight text-black">
          <Link to={detailPath} className="transition-colors hover:text-cobalt-700">
            {attraction.name}
          </Link>
        </h3>

        <p className="clamp-2 mt-2 text-sm leading-6 text-neutral-600">{attraction.description}</p>

        <div className="mt-3 space-y-1.5">
          <MetaRow icon="map-pin">{attraction.address}</MetaRow>
          {hasCoordinates ? null : <MetaRow icon="compass">Location not recorded</MetaRow>}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <ButtonLink to={detailPath} variant="outline" size="sm">
            View details
            <Icon name="arrow-right" className="h-3.5 w-3.5" />
          </ButtonLink>

          {attraction.savedCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
              <Icon name="bookmark-filled" className="h-3.5 w-3.5 text-cobalt-600" />
              {attraction.savedCount}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default AttractionCard;
