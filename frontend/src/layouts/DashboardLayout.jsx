/**
 * Dashboard shell shared by the curator and administrator areas.
 *
 * A sidebar on large screens and a horizontally scrollable tab strip on small
 * ones — the table and form pages inside are dense, so the navigation must not
 * consume vertical space on a phone.
 */
import { NavLink, Outlet } from 'react-router-dom';

import { Navbar } from '../components/layout/Navbar.jsx';
import { Icon } from '../components/ui/index.js';
import { classNames } from '../utils/format.js';

export function DashboardLayout({ title, description, sections, children }) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <Navbar />

      <div className="container-page flex-1 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-neutral-600">{description}</p>
          ) : null}
        </header>

        <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-8">
          {/* Section navigation */}
          <nav aria-label={`${title} sections`} className="mb-6 lg:mb-0">
            <ul className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible lg:pb-0">
              {sections.map((section) => (
                <li key={section.to} className="shrink-0 lg:shrink">
                  <NavLink
                    to={section.to}
                    end={section.end}
                    className={({ isActive }) =>
                      classNames(
                        'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                        isActive
                          ? 'bg-cobalt-600 text-white'
                          : 'text-black hover:bg-white hover:text-cobalt-700',
                      )
                    }
                  >
                    <Icon name={section.icon} className="h-4 w-4" />
                    {section.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">{children ?? <Outlet />}</div>
        </div>
      </div>
    </div>
  );
}

export default DashboardLayout;
