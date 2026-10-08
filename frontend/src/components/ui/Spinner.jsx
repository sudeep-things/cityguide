/**
 * Loading spinner.
 *
 * Marked `role="status"` with visually hidden text so assistive technology
 * announces that work is in progress rather than showing a silent image.
 */
export function Spinner({ className = 'h-5 w-5', label = 'Loading', showLabel = false }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <svg
        className={`animate-spin ${className}`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        <path
          d="M21 12a9 9 0 00-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {showLabel ? <span className="text-sm text-neutral-600">{label}</span> : null}
      {!showLabel ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/** Full-page loading state for route-level suspense. */
export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Spinner className="h-8 w-8 text-cobalt-600" />
      <p className="text-sm text-neutral-600">{label}</p>
    </div>
  );
}

export default Spinner;
