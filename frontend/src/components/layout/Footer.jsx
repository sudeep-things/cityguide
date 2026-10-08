/**
 * Site footer, including the attribution required by the services this
 * application depends on.
 */
import { Link } from 'react-router-dom';

import { Icon } from '../ui/index.js';

const EXPLORE_LINKS = [
  { to: '/attractions', label: 'Browse attractions' },
  { to: '/attractions?sort=name_asc', label: 'A–Z index' },
  { to: '/itineraries', label: 'My itineraries' },
  { to: '/saved', label: 'Saved places' },
];

const CATEGORY_LINKS = [
  { to: '/attractions?category=museum', label: 'Museums' },
  { to: '/attractions?category=nature', label: 'Parks and nature' },
  { to: '/attractions?category=historical', label: 'Historical sites' },
  { to: '/attractions?category=food', label: 'Food and markets' },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-neutral-200 bg-white">
      <div className="container-page py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cobalt-600">
                <Icon name="map-pin" className="h-5 w-5 text-white" />
              </span>
              <span className="text-lg font-bold tracking-tight text-black">
                City<span className="text-cobalt-600">Guide</span>
              </span>
            </span>
            <p className="mt-4 max-w-xs text-sm leading-6 text-neutral-600">
              Discover attractions, save the places you love, and organise them into day-by-day
              itineraries you can come back to.
            </p>
          </div>

          <nav aria-labelledby="footer-explore">
            <h2 id="footer-explore" className="text-sm font-bold text-black">
              Explore
            </h2>
            <ul className="mt-4 space-y-2.5">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm text-neutral-600 transition-colors hover:text-cobalt-700">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-categories">
            <h2 id="footer-categories" className="text-sm font-bold text-black">
              Popular categories
            </h2>
            <ul className="mt-4 space-y-2.5">
              {CATEGORY_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm text-neutral-600 transition-colors hover:text-cobalt-700">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-bold text-black">Data and attribution</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-neutral-600">
              <li>
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-cobalt-700"
                >
                  © OpenStreetMap contributors
                  <Icon name="external-link" className="h-3.5 w-3.5" />
                </a>
              </li>
              <li>
                <a
                  href="https://nominatim.org/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-cobalt-700"
                >
                  Geocoding by Nominatim
                  <Icon name="external-link" className="h-3.5 w-3.5" />
                </a>
              </li>
              <li>
                <a
                  href="https://www.wikipedia.org/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-cobalt-700"
                >
                  Descriptions and images from Wikipedia (CC BY-SA)
                  <Icon name="external-link" className="h-3.5 w-3.5" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-neutral-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-neutral-500">
            CityGuide — a demonstration tourism planning application.
          </p>
          <p className="text-xs text-neutral-500">
            Map tiles are loaded directly from OpenStreetMap; addresses are geocoded on request via
            the Nominatim API.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
