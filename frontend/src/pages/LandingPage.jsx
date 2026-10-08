/**
 * Destination landing page.
 *
 * Communicates the two things a visitor can do here — discover places and build
 * a day plan — and gives a direct route into both. Featured content comes from
 * the API, so the page reflects real catalogue and save activity rather than
 * hard-coded placeholders.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { attractionService, categoryService } from '../services/resources.js';
import { queryKeys } from '../services/queryKeys.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDocumentTitle } from '../hooks/useApp.js';
import { AttractionCard } from '../components/attractions/AttractionCard.jsx';
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Icon,
  SectionHeading,
  SkeletonGrid,
} from '../components/ui/index.js';

/** Category tiles shown on the landing page. */
function CategoryTile({ category }) {
  return (
    <Link
      to={`/attractions?category=${encodeURIComponent(category.slug)}`}
      className="card card-interactive flex items-center justify-between gap-4 p-4"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cobalt-50 text-cobalt-700">
          <Icon name="layers" className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-black">{category.name}</span>
          <span className="block text-xs text-neutral-500">
            {category.attractionCount} {category.attractionCount === 1 ? 'place' : 'places'}
          </span>
        </span>
      </span>
      <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-neutral-400" />
    </Link>
  );
}

const STEPS = [
  {
    icon: 'search',
    title: 'Discover',
    body: 'Search the catalogue by name, filter by category and sort the results however suits your trip.',
  },
  {
    icon: 'bookmark',
    title: 'Save',
    body: 'Keep a shortlist of the places that interest you. Your saved list follows your account.',
  },
  {
    icon: 'route',
    title: 'Plan',
    body: 'Drop places into an itinerary and drag them into the order you actually want to walk them.',
  },
];

export function LandingPage() {
  useDocumentTitle();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  const featuredQuery = useQuery({
    queryKey: queryKeys.featuredAttractions,
    queryFn: () => attractionService.featured(6),
    staleTime: 60_000,
  });

  const recentQuery = useQuery({
    queryKey: queryKeys.recentAttractions,
    queryFn: () => attractionService.recent(3),
    staleTime: 60_000,
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => categoryService.list(),
    staleTime: 5 * 60_000,
  });

  const featured = featuredQuery.data?.items ?? [];
  const recent = recentQuery.data?.items ?? [];
  const categories = categoriesQuery.data?.items ?? [];

  const popularCategories = [...categories]
    .sort((a, b) => (b.attractionCount ?? 0) - (a.attractionCount ?? 0))
    .slice(0, 6);

  function handleSearch(event) {
    event.preventDefault();
    const term = searchTerm.trim();
    navigate(term ? `/attractions?search=${encodeURIComponent(term)}` : '/attractions');
  }

  return (
    <>
      {/* Hero ------------------------------------------------------------- */}
      <section className="hero-surface">
        <div className="container-page py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <span className="badge border-white/20 bg-white/10 text-white">
              <Icon name="compass" className="h-3.5 w-3.5" />
              Attraction discovery and itinerary planning
            </span>

            <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Discover the city.
              <br />
              <span className="text-cobalt-300">Plan the perfect day.</span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
              Browse museums, parks, markets and landmarks; save the ones you like; then arrange them
              into day-by-day itineraries you can come back to at any time.
            </p>

            {/* Search */}
            <form onSubmit={handleSearch} className="mt-8" role="search">
              <label htmlFor="landing-search" className="sr-only">
                Search attractions
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Icon
                    name="search"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
                  />
                  <input
                    id="landing-search"
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Try “museum”, “park” or “market”"
                    className="input h-12 pl-11 text-base"
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" size="lg" className="h-12 shrink-0">
                  <Icon name="search" className="h-4 w-4" />
                  Search attractions
                </Button>
              </div>
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ButtonLink to="/attractions" variant="secondary" size="lg">
                Explore all attractions
                <Icon name="arrow-right" className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink
                to={isAuthenticated ? '/itineraries' : '/register'}
                variant="ghost"
                size="lg"
                className="border border-white/25 bg-white/5 text-white hover:bg-white/10"
              >
                <Icon name="route" className="h-4 w-4" />
                {isAuthenticated ? 'My itineraries' : 'Create an itinerary'}
              </ButtonLink>
            </div>

            {isAuthenticated ? (
              <p className="mt-5 text-sm text-white/70">
                Welcome back, {user.name.split(' ')[0]}.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="container-page">
        {/* Popular categories --------------------------------------------- */}
        <section className="py-14" aria-labelledby="categories-heading">
          <SectionHeading
            title="Browse by category"
            description="Nine categories covering history, nature, culture, food and more."
            action={
              <ButtonLink to="/attractions" variant="outline" size="sm">
                View all
              </ButtonLink>
            }
          />
          <h2 id="categories-heading" className="sr-only">
            Popular categories
          </h2>

          {categoriesQuery.isPending ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="skeleton h-[4.5rem] rounded-xl" />
              ))}
            </div>
          ) : categoriesQuery.isError ? (
            <ErrorState
              className="mt-6"
              title="Unable to load categories"
              message="No categories available. Please try again."
              onRetry={categoriesQuery.refetch}
            />
          ) : popularCategories.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon="layers"
              title="No categories available"
              description="A curator needs to add categories before attractions can be classified."
            />
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popularCategories.map((category) => (
                <li key={category.id}>
                  <CategoryTile category={category} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Featured attractions ------------------------------------------- */}
        <section className="py-14" aria-labelledby="featured-heading">
          <SectionHeading
            title="Featured attractions"
            description="The places travelers are saving most right now."
            action={
              <ButtonLink to="/attractions?sort=name_asc" variant="outline" size="sm">
                Browse A–Z
              </ButtonLink>
            }
          />
          <h2 id="featured-heading" className="sr-only">
            Featured attractions
          </h2>

          <div className="mt-6">
            {featuredQuery.isPending ? (
              <SkeletonGrid count={6} />
            ) : featuredQuery.isError ? (
              <ErrorState
                title="Unable to load attractions"
                message="Unable to load attractions. Please try again."
                onRetry={featuredQuery.refetch}
              />
            ) : featured.length === 0 ? (
              <EmptyState
                icon="compass"
                title="No attractions yet"
                description="Once a curator publishes attractions they will appear here."
                action={
                  <ButtonLink to="/attractions" variant="primary">
                    Go to attractions
                  </ButtonLink>
                }
              />
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((attraction, index) => (
                  <AttractionCard key={attraction.id} attraction={attraction} eager={index < 3} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* How it works ---------------------------------------------------- */}
        <section className="py-14" aria-labelledby="how-heading">
          <SectionHeading
            title="How CityGuide works"
            description="Three steps from browsing to a plan you can follow."
          />
          <h2 id="how-heading" className="sr-only">
            How CityGuide works
          </h2>

          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="card p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-cobalt-600 text-white">
                  <Icon name={step.icon} className="h-5 w-5" />
                </span>
                <p className="mt-4 text-xs font-bold uppercase tracking-wider text-cobalt-700">
                  Step {index + 1}
                </p>
                <h3 className="mt-1 text-base font-bold text-black">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-neutral-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Recently added -------------------------------------------------- */}
        {recent.length > 0 ? (
          <section className="py-14" aria-labelledby="recent-heading">
            <SectionHeading
              title="Recently added"
              description="The newest entries in the catalogue."
            />
            <h2 id="recent-heading" className="sr-only">
              Recently added
            </h2>

            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((attraction) => (
                <AttractionCard key={attraction.id} attraction={attraction} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Closing call to action ------------------------------------------ */}
        <section className="pb-8 pt-14">
          <div className="hero-surface overflow-hidden rounded-2xl px-6 py-12 sm:px-12">
            <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
              <div className="max-w-xl">
                <Badge variant="cobalt" className="border-white/20 bg-white/10 text-white">
                  <Icon name="sparkle" className="h-3.5 w-3.5" />
                  Free to use
                </Badge>
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Build your first itinerary in a couple of minutes
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/80">
                  Create a free account to save places and arrange them into an ordered day plan. Your
                  itineraries are private to you.
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                <ButtonLink
                  to={isAuthenticated ? '/itineraries' : '/register'}
                  variant="secondary"
                  size="lg"
                >
                  {isAuthenticated ? 'Open my itineraries' : 'Create your account'}
                </ButtonLink>
                <ButtonLink
                  to="/attractions"
                  variant="ghost"
                  size="lg"
                  className="border border-white/25 bg-white/5 text-white hover:bg-white/10"
                >
                  Browse first
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

export default LandingPage;
