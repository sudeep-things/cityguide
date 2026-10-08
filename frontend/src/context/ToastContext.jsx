/**
 * Toast notifications.
 *
 * Accessibility notes:
 *   * the region is a live region, so screen readers announce new messages;
 *   * errors use `role="alert"` (assertive) while successes use `role="status"`
 *     (polite) so a confirmation never interrupts the user mid-sentence;
 *   * state is conveyed by an icon and text as well as colour.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

const DEFAULT_DURATION = 5000;

const VARIANT_STYLES = {
  success: {
    container: 'border-neutral-200',
    accent: 'bg-[#15803d]',
    icon: 'text-[#15803d]',
    role: 'status',
  },
  error: {
    container: 'border-neutral-200',
    accent: 'bg-[#b91c1c]',
    icon: 'text-[#b91c1c]',
    role: 'alert',
  },
  info: {
    container: 'border-neutral-200',
    accent: 'bg-cobalt-600',
    icon: 'text-cobalt-600',
    role: 'status',
  },
};

function ToastIcon({ variant, className }) {
  const common = { className, viewBox: '0 0 20 20', fill: 'currentColor', 'aria-hidden': 'true' };

  if (variant === 'success') {
    return (
      <svg {...common}>
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 10-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (variant === 'error') {
    return (
      <svg {...common}>
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 011.4 0L10 7.6l-.1-.1.1.1.1-.1-.1.1 1.3 1.3a1 1 0 01-1.4 1.4L10 9.4l-1.3 1.3a1 1 0 01-1.4-1.4L8.6 8 7.3 7.7a1 1 0 010-1.4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    ({ variant = 'info', message, title, duration = DEFAULT_DURATION }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current.slice(-3), { id, variant, message, title }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Clear pending timers if the provider unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo(
    () => ({
      success: (message, options) => push({ ...options, variant: 'success', message }),
      error: (message, options) => push({ ...options, variant: 'error', message }),
      info: (message, options) => push({ ...options, variant: 'info', message }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end sm:p-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const styles = VARIANT_STYLES[toast.variant] ?? VARIANT_STYLES.info;
          return (
            <div
              key={toast.id}
              role={styles.role}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border bg-white p-4 shadow-lg ${styles.container}`}
            >
              <span className={`mt-0.5 h-full w-1 shrink-0 self-stretch rounded-full ${styles.accent}`} />
              <ToastIcon variant={toast.variant} className={`mt-0.5 h-5 w-5 shrink-0 ${styles.icon}`} />
              <div className="min-w-0 flex-1">
                {toast.title ? (
                  <p className="text-sm font-semibold text-black">{toast.title}</p>
                ) : null}
                <p className="text-sm leading-5 text-neutral-700">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-m-1 rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-black"
                aria-label="Dismiss notification"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider.');
  return context;
}
