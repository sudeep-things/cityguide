/**
 * Attraction grid / list.
 *
 * Renders the correct skeleton, empty or error state for the query it is given,
 * so every consumer gets consistent behaviour without repeating the branches.
 */
import { AttractionCard } from './AttractionCard.jsx';
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Icon,
  SkeletonGrid,
} from '../ui/index.js';
import { classNames } from '../../utils/format.js';

export function AttractionGrid({
  attractions,
  layout = 'grid',
  isLoading = false,
  isError = false,
  error,
  onRetry,
  onResetFilters,
  hasActiveFilters = false,
  skeletonCount = 6,
  emptyTitle = 'No attractions found',
  emptyDescription = 'Try a different search term or clear the filters to see everything.',
}) {
  if (isLoading) {
    return <SkeletonGrid count={skeletonCount} />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Unable to load attractions"
        message={error?.message ?? 'Unable to load attractions. Please try again.'}
        onRetry={onRetry}
      />
    );
  }

  if (!attractions || attractions.length === 0) {
    return (
      <EmptyState
        icon={hasActiveFilters ? 'search' : 'compass'}
        title={emptyTitle}
        description={hasActiveFilters ? emptyDescription : 'Nothing has been added here yet.'}
        action={
          hasActiveFilters && onResetFilters ? (
            <Button variant="outline" onClick={onResetFilters}>
              <Icon name="refresh" className="h-4 w-4" />
              Clear filters
            </Button>
          ) : (
            <ButtonLink to="/attractions" variant="primary">
              Browse all attractions
            </ButtonLink>
          )
        }
      />
    );
  }

  return (
    <div
      className={classNames(
        layout === 'list' ? 'space-y-4' : 'grid gap-6 sm:grid-cols-2 xl:grid-cols-3',
      )}
    >
      {attractions.map((attraction, index) => (
        <AttractionCard
          key={attraction.id}
          attraction={attraction}
          layout={layout}
          // The first row is above the fold on most screens.
          eager={index < 3}
        />
      ))}
    </div>
  );
}

export default AttractionGrid;
