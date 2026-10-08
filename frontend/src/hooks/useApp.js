/**
 * Small reusable hooks.
 */
import { useEffect, useState } from 'react';

/**
 * Delays a rapidly changing value.
 *
 * Used for the attraction search box so typing does not fire a request per
 * keystroke — which also keeps the backend's rate limiter and the client-side
 * cache from being hammered by ordinary typing.
 */
export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/** Keeps the document title in step with the current page. */
export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · CityGuide` : 'CityGuide — Discover places. Plan your day.';
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/**
 * Tracks a CSS media query.
 *
 * Used sparingly — layout is handled with CSS — but needed where behaviour (not
 * styling) differs, such as enabling map dragging only on pointer devices.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const handler = (event) => setMatches(event.matches);
    list.addEventListener('change', handler);
    setMatches(list.matches);
    return () => list.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Locks body scrolling, for full-screen overlays. */
export function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}
