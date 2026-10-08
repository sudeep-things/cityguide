/**
 * Icon set.
 *
 * A single inline-SVG component keeps the bundle free of an icon dependency and
 * guarantees every icon inherits `currentColor`, so icons follow the cobalt and
 * black palette automatically. All icons are decorative by default
 * (`aria-hidden`); callers supply an accessible name where one is needed.
 */

const PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  'map-pin': (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  bookmark: <path d="M6 4.5h12a1 1 0 011 1V20l-7-4-7 4V5.5a1 1 0 011-1z" />,
  'bookmark-filled': (
    <path d="M6 4.5h12a1 1 0 011 1V20l-7-4-7 4V5.5a1 1 0 011-1z" fill="currentColor" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 4.5h4" />
      <path d="M6.5 7l1 12.5h9L17.5 7" />
      <path d="M10.5 11v5M13.5 11v5" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  'chevron-down': <path d="M6 9.5l6 6 6-6" />,
  'chevron-up': <path d="M6 14.5l6-6 6 6" />,
  'chevron-left': <path d="M14.5 6l-6 6 6 6" />,
  'chevron-right': <path d="M9.5 6l6 6-6 6" />,
  'arrow-up': <path d="M12 19V5M6 11l6-6 6 6" />,
  'arrow-down': <path d="M12 5v14M6 13l6 6 6-6" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8.5" r="3.2" />
      <path d="M3.5 20c0-3.4 2.7-5.2 6-5.2s6 1.8 6 5.2" />
      <path d="M16 5.6a3.2 3.2 0 010 6.1M17.5 14.9c2 .5 3.5 1.9 3.5 4" />
    </>
  ),
  logout: (
    <>
      <path d="M15 12H4" />
      <path d="M8.5 8L4.5 12l4 4" />
      <path d="M14 4.5h4a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5h-4" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M4 10h16M9 4v4M15 4v4" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  'alert-triangle': (
    <>
      <path d="M12 4.5l8.5 15h-17l8.5-15z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  'external-link': (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5L11 13" />
      <path d="M18 14v5a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 19V8.5A1.5 1.5 0 016 7h5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.4 3.4 5.4 3.4 8.5s-1.2 6.1-3.4 8.5c-2.2-2.4-3.4-5.4-3.4-8.5S9.8 5.9 12 3.5z" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M4.5 7.5l7.5 5.5 7.5-5.5" />
    </>
  ),
  filter: <path d="M4 6.5h16M7 12h10M10 17.5h4" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  route: (
    <>
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="M9 6.5h5a3.5 3.5 0 010 7h-4a3.5 3.5 0 000 7h5" />
    </>
  ),
  dashboard: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  list: <path d="M8 6.5h12M8 12h12M8 17.5h12M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  shield: (
    <>
      <path d="M12 3.5l7 2.5v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-2.5z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M5 17l4.5-4.5L13 16l3-3 3 3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 10-2.5 6" />
      <path d="M20 5v6h-6" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15 9l-2 5-4 2 2-5 4-2z" />
    </>
  ),
  sparkle: <path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8L12 4z" />,
  layers: (
    <>
      <path d="M12 4l8 4-8 4-8-4 8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16l8 4 8-4" />
    </>
  ),
  'trending-up': (
    <>
      <path d="M4 17l5-5 3.5 3.5L20 8" />
      <path d="M20 13V8h-5" />
    </>
  ),
};

export function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.75, ...rest }) {
  const path = PATHS[name];
  if (!path) return null;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path}
    </svg>
  );
}

export default Icon;
