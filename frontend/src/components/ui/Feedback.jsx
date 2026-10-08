/**
 * Loading, empty, error and status states.
 *
 * Every data-driven view in the application uses these, so the same vocabulary
 * appears everywhere: a shimmering skeleton while loading, an explicit "nothing
 * here yet" with a next step, and a recoverable error with a retry action.
 */
import { Icon } from './Icon.jsx';
import { Button } from './Button.jsx';
import { classNames } from '../../utils/format.js';

/* -------------------------------------------------------------------------- */
/* Skeletons                                                                   */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className }) {
  return <div className={classNames('skeleton', className)} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={classNames('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={classNames('h-3.5', index === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

/** Card-shaped placeholder matching `AttractionCard`'s layout. */
export function SkeletonCard() {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <Skeleton className="h-44 w-full rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-4 w-20 rounded-full" />
        <Skeleton className="h-5 w-3/4" />
        <SkeletonText lines={2} />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6, className }) {
  return (
    <div
      className={classNames(
        'grid gap-6 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
      role="status"
      aria-label="Loading content"
    >
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 5 }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading content">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty and error states                                                      */
/* -------------------------------------------------------------------------- */

/**
 * "Nothing here" state. `action` should always offer a way forward, so the user
 * is never left at a dead end.
 */
export function EmptyState({ icon = 'compass', title, description, action, className }) {
  return (
    <div
      className={classNames(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-14 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
        <Icon name={icon} className="h-6 w-6 text-cobalt-600" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-black">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm leading-6 text-neutral-600">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/**
 * Error state with a retry affordance. `message` should be the friendly text
 * from the API, never a raw error.
 */
export function ErrorState({ title = 'Unable to load data', message, onRetry, className }) {
  return (
    <div
      role="alert"
      className={classNames(
        'flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 py-14 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fef2f2]">
        <Icon name="alert-triangle" className="h-6 w-6 text-[#b91c1c]" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-black">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-neutral-600">
        {message ?? 'Something went wrong. Please try again.'}
      </p>
      {onRetry ? (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <Icon name="refresh" className="h-4 w-4" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Alerts                                                                      */
/* -------------------------------------------------------------------------- */

const ALERT_VARIANTS = {
  info: { wrapper: 'border-cobalt-200 bg-cobalt-50', icon: 'info', iconColor: 'text-cobalt-700' },
  success: { wrapper: 'border-[#bbf7d0] bg-[#f0fdf4]', icon: 'check', iconColor: 'text-[#15803d]' },
  warning: {
    wrapper: 'border-[#fde68a] bg-[#fffbeb]',
    icon: 'alert-triangle',
    iconColor: 'text-[#a16207]',
  },
  error: {
    wrapper: 'border-[#fecaca] bg-[#fef2f2]',
    icon: 'alert-triangle',
    iconColor: 'text-[#b91c1c]',
  },
};

/** Inline contextual message, for form-level results and page notices. */
export function Alert({ variant = 'info', title, children, className, role }) {
  const styles = ALERT_VARIANTS[variant] ?? ALERT_VARIANTS.info;

  return (
    <div
      role={role ?? (variant === 'error' ? 'alert' : 'status')}
      className={classNames('flex items-start gap-3 rounded-lg border p-4', styles.wrapper, className)}
    >
      <Icon name={styles.icon} className={classNames('mt-0.5 h-5 w-5 shrink-0', styles.iconColor)} />
      <div className="min-w-0 flex-1 text-sm leading-6">
        {title ? <p className="font-semibold text-black">{title}</p> : null}
        <div className="text-neutral-700">{children}</div>
      </div>
    </div>
  );
}

/** Non-blocking inline error used under forms. */
export function InlineError({ children, className }) {
  if (!children) return null;
  return (
    <p className={classNames('field-error', className)} role="alert">
      <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export default EmptyState;
