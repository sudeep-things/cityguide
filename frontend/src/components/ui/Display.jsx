/**
 * Presentational building blocks: surfaces, badges, statistics, images,
 * pagination and avatars.
 */
import { useEffect, useState } from 'react';

import { Icon } from './Icon.jsx';
import { Button } from './Button.jsx';
import { classNames, initialsOf } from '../../utils/format.js';

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Card({ as: Component = 'div', className, children, ...rest }) {
  return (
    <Component className={classNames('card', className)} {...rest}>
      {children}
    </Component>
  );
}

/** Section title with optional description and trailing action. */
export function SectionHeading({ title, description, action, level = 2, className }) {
  const Heading = `h${level}`;
  return (
    <div className={classNames('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <Heading
          className={classNames(
            'font-bold tracking-tight text-black',
            level === 1 ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl',
          )}
        >
          {title}
        </Heading>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-neutral-600">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges and chips                                                            */
/* -------------------------------------------------------------------------- */

const BADGE_VARIANTS = {
  cobalt: 'badge-cobalt',
  neutral: 'badge-neutral',
  success: 'badge-success',
  danger: 'badge-danger',
  warning: 'badge-warning',
};

export function Badge({ variant = 'neutral', icon, children, className }) {
  return (
    <span className={classNames('badge', BADGE_VARIANTS[variant] ?? BADGE_VARIANTS.neutral, className)}>
      {icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

/** Human labels and colours for the role enum. */
const ROLE_VARIANTS = { admin: 'cobalt', curator: 'success', traveler: 'neutral' };

export function RoleBadge({ role }) {
  const labels = { admin: 'Administrator', curator: 'Curator', traveler: 'Traveler' };
  return (
    <Badge variant={ROLE_VARIANTS[role] ?? 'neutral'} icon="shield">
      {labels[role] ?? role}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Statistics                                                                  */
/* -------------------------------------------------------------------------- */

export function StatCard({ label, value, hint, icon, tone = 'default' }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-neutral-600">{label}</p>
        {icon ? (
          <span
            className={classNames(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              tone === 'cobalt' ? 'bg-cobalt-50 text-cobalt-700' : 'bg-neutral-100 text-neutral-700',
            )}
          >
            <Icon name={icon} className="h-5 w-5" />
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-3xl font-bold tracking-tight text-black">
        {value === null || value === undefined ? '—' : value}
      </p>

      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Images                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Image with an explicit loading skeleton and a branded fallback.
 *
 * Attraction imagery is remote, so both failure and slow loading are normal
 * states rather than edge cases. The fallback uses the palette rather than a
 * broken-image icon so a missing photo still looks intentional.
 */
export function SafeImage({
  src,
  alt,
  className,
  fallbackIcon = 'image',
  fallbackLabel,
  loading = 'lazy',
}) {
  const [status, setStatus] = useState(src ? 'loading' : 'error');

  useEffect(() => {
    setStatus(src ? 'loading' : 'error');
  }, [src]);

  return (
    <div className={classNames('relative overflow-hidden bg-neutral-100', className)}>
      {status === 'loading' ? <div className="skeleton absolute inset-0 rounded-none" /> : null}

      {status === 'error' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-cobalt-700 via-cobalt-800 to-black px-3 text-center">
          <Icon name={fallbackIcon} className="h-7 w-7 text-white/85" />
          {fallbackLabel ? (
            <span className="clamp-2 text-xs font-medium leading-4 text-white/80">
              {fallbackLabel}
            </span>
          ) : null}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={classNames(
            'h-full w-full object-cover transition-opacity duration-300',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatars                                                                     */
/* -------------------------------------------------------------------------- */

export function Avatar({ name, size = 'md', className }) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' };

  return (
    <span
      className={classNames(
        'flex shrink-0 items-center justify-center rounded-full bg-cobalt-600 font-semibold text-white',
        sizes[size] ?? sizes.md,
        className,
      )}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Page navigation with an explicit result summary.
 *
 * Renders the current window of pages with ellipses, and always shows the total
 * so the user knows whether refining the filters would help.
 */
export function Pagination({ pagination, onPageChange, className, itemLabel = 'results' }) {
  if (!pagination) return null;

  const { page, totalPages, totalItems, limit } = pagination;
  const first = totalItems === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, totalItems);

  if (totalPages <= 1) {
    return (
      <p className={classNames('text-sm text-neutral-600', className)}>
        {totalItems} {itemLabel}
      </p>
    );
  }

  /** Builds a compact page list: 1 … 4 5 6 … 20 */
  const pages = [];
  const windowSize = 1;
  for (let candidate = 1; candidate <= totalPages; candidate += 1) {
    const isEdge = candidate === 1 || candidate === totalPages;
    const isNearCurrent = Math.abs(candidate - page) <= windowSize;
    if (isEdge || isNearCurrent) pages.push(candidate);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }

  return (
    <nav
      className={classNames('flex flex-wrap items-center justify-between gap-4', className)}
      aria-label="Pagination"
    >
      <p className="text-sm text-neutral-600">
        Showing <span className="font-semibold text-black">{first}</span>–
        <span className="font-semibold text-black">{last}</span> of{' '}
        <span className="font-semibold text-black">{totalItems}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!pagination.hasPreviousPage}
          aria-label="Previous page"
        >
          <Icon name="chevron-left" className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>

        {pages.map((entry, index) =>
          entry === '…' ? (
            <span key={`gap-${index}`} className="px-2 text-sm text-neutral-400" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? 'page' : undefined}
              className={classNames(
                'min-w-9 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                entry === page
                  ? 'bg-cobalt-600 text-white'
                  : 'text-black hover:bg-neutral-100',
              )}
            >
              {entry}
            </button>
          ),
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!pagination.hasNextPage}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <Icon name="chevron-right" className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}

/** Wrapper adding horizontal scroll on narrow screens for wide tables. */
export function TableWrapper({ children, className }) {
  return <div className={classNames('table-wrap', className)}>{children}</div>;
}

export default Card;
