/**
 * Primary navigation.
 *
 * Desktop shows the full link set; below `lg` the links collapse into a
 * disclosing panel. Role-specific destinations (curator, admin) are rendered
 * only for accounts that hold those roles — a convenience, not a security
 * measure, since every one of those routes is independently authorized by the
 * backend.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Avatar, Button, ButtonLink, Icon } from '../ui/index.js';
import { classNames } from '../../utils/format.js';

const PUBLIC_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/attractions', label: 'Attractions' },
];

const TRAVELER_LINKS = [
  { to: '/itineraries', label: 'My Itineraries', icon: 'route' },
  { to: '/saved', label: 'Saved Places', icon: 'bookmark' },
];

function navLinkClasses({ isActive }) {
  return classNames(
    'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
    isActive ? 'text-cobalt-700' : 'text-black hover:bg-neutral-100',
  );
}

/** The CityGuide wordmark. */
function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cobalt-600">
        <Icon name="map-pin" className="h-5 w-5 text-white" />
      </span>
      <span className="text-lg font-bold tracking-tight text-black">
        City<span className="text-cobalt-600">Guide</span>
      </span>
    </span>
  );
}

export function Navbar() {
  const { user, isAuthenticated, isCurator, isAdmin, logout, isLoggingOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);

  // Close transient menus whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  // Dismiss the account menu on an outside click or Escape.
  useEffect(() => {
    if (!accountOpen) return undefined;

    function handlePointerDown(event) {
      if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false);
    }
    function handleKey(event) {
      if (event.key === 'Escape') setAccountOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [accountOpen]);

  async function handleSignOut() {
    try {
      await logout();
      toast.success('You have been signed out.');
      navigate('/');
    } catch {
      toast.error('We could not sign you out. Please try again.');
    }
  }

  const dashboardLinks = [
    isCurator ? { to: '/curator', label: 'Curator Dashboard', icon: 'pencil' } : null,
    isAdmin ? { to: '/admin', label: 'Admin Dashboard', icon: 'shield' } : null,
  ].filter(Boolean);

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="container-page">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            to="/"
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label="CityGuide home"
          >
            <Wordmark />
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {PUBLIC_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={navLinkClasses}>
                {link.label}
              </NavLink>
            ))}

            {isAuthenticated
              ? TRAVELER_LINKS.map((link) => (
                  <NavLink key={link.to} to={link.to} className={navLinkClasses}>
                    {link.label}
                  </NavLink>
                ))
              : null}

            {dashboardLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className={navLinkClasses}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <div className="relative" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-neutral-100"
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                >
                  <Avatar name={user.name} size="sm" />
                  <span className="hidden max-w-28 truncate text-sm font-semibold text-black sm:inline">
                    {user.name}
                  </span>
                  <Icon name="chevron-down" className="h-4 w-4 text-neutral-500" />
                </button>

                {accountOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
                  >
                    <div className="border-b border-neutral-100 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-black">{user.name}</p>
                      <p className="truncate text-xs text-neutral-500">{user.email}</p>
                    </div>

                    <NavLink
                      to="/profile"
                      role="menuitem"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-50"
                    >
                      <Icon name="user" className="h-4 w-4 text-neutral-500" />
                      Profile
                    </NavLink>

                    {[
                      ...TRAVELER_LINKS,
                      ...dashboardLinks,
                    ].map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        role="menuitem"
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-50 lg:hidden"
                      >
                        <Icon name={link.icon} className="h-4 w-4 text-neutral-500" />
                        {link.label}
                      </NavLink>
                    ))}

                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleSignOut}
                      disabled={isLoggingOut}
                      className="flex w-full items-center gap-2.5 border-t border-neutral-100 px-4 py-2.5 text-left text-sm font-medium text-black transition-colors hover:bg-neutral-50 disabled:opacity-60"
                    >
                      <Icon name="logout" className="h-4 w-4 text-neutral-500" />
                      {isLoggingOut ? 'Signing out…' : 'Sign out'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <ButtonLink to="/login" variant="ghost" size="sm">
                  Sign in
                </ButtonLink>
                <ButtonLink to="/register" variant="primary" size="sm">
                  Create account
                </ButtonLink>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button
              type="button"
              className="rounded-lg p-2 text-black transition-colors hover:bg-neutral-100 lg:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              <Icon name={mobileOpen ? 'close' : 'menu'} className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Mobile navigation panel */}
        {mobileOpen ? (
          <nav
            id="mobile-navigation"
            aria-label="Main"
            className="border-t border-neutral-200 py-3 lg:hidden"
          >
            <ul className="space-y-1">
              {[
                ...PUBLIC_LINKS,
                ...(isAuthenticated ? TRAVELER_LINKS : []),
                ...dashboardLinks,
                ...(isAuthenticated ? [{ to: '/profile', label: 'Profile', icon: 'user' }] : []),
              ].map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) =>
                      classNames(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                        isActive
                          ? 'bg-cobalt-50 text-cobalt-700'
                          : 'text-black hover:bg-neutral-100',
                      )
                    }
                  >
                    {link.icon ? (
                      <Icon name={link.icon} className="h-4 w-4 text-current" />
                    ) : (
                      <Icon name="compass" className="h-4 w-4 text-current" />
                    )}
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>

            {!isAuthenticated ? (
              <div className="mt-3 flex flex-col gap-2 border-t border-neutral-200 pt-3">
                <ButtonLink to="/login" variant="outline" block>
                  Sign in
                </ButtonLink>
                <ButtonLink to="/register" variant="primary" block>
                  Create account
                </ButtonLink>
              </div>
            ) : (
              <div className="mt-3 border-t border-neutral-200 pt-3">
                <Button
                  variant="outline"
                  block
                  onClick={handleSignOut}
                  loading={isLoggingOut}
                >
                  <Icon name="logout" className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            )}
          </nav>
        ) : null}
      </div>
    </header>
  );
}

export default Navbar;
