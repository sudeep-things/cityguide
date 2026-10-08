/**
 * Search, category, sort and layout controls for the attractions page.
 *
 * The search box keeps its own draft value and publishes it after a short
 * debounce, so typing does not issue one request per keystroke. Everything else
 * is applied immediately. The parent owns the committed values (they live in the
 * URL), which keeps the page shareable and back-button friendly.
 */
import { useEffect, useRef, useState } from 'react';

import { Button, Icon, SelectField, Spinner, TextField } from '../ui/index.js';
import { useDebounce } from '../../hooks/useApp.js';
import { classNames } from '../../utils/format.js';

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'category', label: 'Category' },
  { value: 'recently_updated', label: 'Recently updated' },
];

export function AttractionFilters({
  search = '',
  category = '',
  sort = 'newest',
  layout = 'grid',
  categories = [],
  totalItems,
  isFetching = false,
  hasActiveFilters = false,
  onChange,
  onReset,
  onLayoutChange,
}) {
  const [searchDraft, setSearchDraft] = useState(search ?? '');
  const lastPublished = useRef(search ?? '');

  const debouncedSearch = useDebounce(searchDraft, 350);

  // Keep the input in step when the URL changes from elsewhere (reset, back button).
  useEffect(() => {
    setSearchDraft(search ?? '');
    lastPublished.current = search ?? '';
  }, [search]);

  // Publish the debounced term, but only when it actually differs.
  useEffect(() => {
    const next = debouncedSearch ?? '';
    if (next !== lastPublished.current) {
      lastPublished.current = next;
      onChange?.({ search: next });
    }
    // `onChange` is stable from the parent via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  return (
    <section aria-label="Filter attractions" className="card p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <div className="relative">
          <TextField
            label="Search attractions"
            placeholder="Museum, park, market…"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            autoComplete="off"
            containerClassName="min-w-0"
          />
          <span className="pointer-events-none absolute right-3 top-[2.15rem] text-neutral-400">
            {isFetching ? (
              <Spinner className="h-4 w-4 text-cobalt-600" />
            ) : (
              <Icon name="search" className="h-4 w-4" />
            )}
          </span>
        </div>

        <SelectField
          label="Category"
          value={category}
          onChange={(event) => onChange?.({ category: event.target.value })}
        >
          <option value="">All categories</option>
          {categories.map((entry) => (
            <option key={entry.id} value={entry.slug}>
              {entry.name}
              {typeof entry.attractionCount === 'number' ? ` (${entry.attractionCount})` : ''}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Sort by"
          value={sort}
          onChange={(event) => onChange?.({ sort: event.target.value })}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        {/* Layout toggle: hidden on small screens where list view is forced. */}
        <div className="hidden lg:block">
          <span className="label">View</span>
          <div
            className="flex overflow-hidden rounded-lg border border-neutral-300"
            role="group"
            aria-label="Result layout"
          >
            {[
              { value: 'grid', icon: 'dashboard', label: 'Grid view' },
              { value: 'list', icon: 'list', label: 'List view' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onLayoutChange?.(option.value)}
                aria-pressed={layout === option.value}
                aria-label={option.label}
                title={option.label}
                className={classNames(
                  'flex h-[2.625rem] w-11 items-center justify-center transition-colors',
                  layout === option.value
                    ? 'bg-cobalt-600 text-white'
                    : 'bg-white text-neutral-600 hover:bg-neutral-100',
                )}
              >
                <Icon name={option.icon} className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
        <p className="text-sm text-neutral-600" aria-live="polite">
          {typeof totalItems === 'number' ? (
            <>
              <span className="font-semibold text-black">{totalItems}</span>{' '}
              {totalItems === 1 ? 'attraction' : 'attractions'}
              {hasActiveFilters ? ' match your filters' : ' in the catalogue'}
            </>
          ) : (
            'Loading attractions…'
          )}
        </p>

        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <Icon name="refresh" className="h-4 w-4" />
            Clear filters
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export default AttractionFilters;
