/**
 * Shared shell for the sign-in and registration pages.
 *
 * A two-column layout: brand panel on the left (hidden on small screens) and the
 * form on the right, so the form itself stays narrow and easy to complete.
 */
import { Link } from 'react-router-dom';

import { Icon } from '../components/ui/index.js';

const HIGHLIGHTS = [
  { icon: 'search', text: 'Search museums, parks, markets and landmarks' },
  { icon: 'bookmark', text: 'Keep a shortlist of the places you like' },
  { icon: 'route', text: 'Arrange them into ordered day-by-day itineraries' },
  { icon: 'lock', text: 'Your itineraries stay private to your account' },
];

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hero-surface hidden flex-col justify-between p-12 lg:flex">
        <Link to="/" className="flex items-center gap-2.5" aria-label="CityGuide home">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
            <Icon name="map-pin" className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight text-white">
            City<span className="text-cobalt-300">Guide</span>
          </span>
        </Link>

        <div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-white">
            Discover places.
            <br />
            Plan your day.
          </h2>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.text} className="flex items-start gap-3 text-sm leading-6 text-white/85">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Icon name={item.icon} className="h-3.5 w-3.5 text-white" />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/60">
          Map data © OpenStreetMap contributors · Geocoding by Nominatim
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden" aria-label="CityGuide home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cobalt-600">
              <Icon name="map-pin" className="h-5 w-5 text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight text-black">
              City<span className="text-cobalt-600">Guide</span>
            </span>
          </Link>

          <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm leading-6 text-neutral-600">{subtitle}</p> : null}

          <div className="mt-8">{children}</div>

          {footer ? <div className="mt-6 text-sm text-neutral-600">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
