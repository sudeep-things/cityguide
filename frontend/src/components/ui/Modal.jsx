/**
 * Modal dialog.
 *
 * Accessibility behaviour is handled here so no caller has to remember it:
 *   * rendered in a portal so it escapes any stacking or overflow context;
 *   * `role="dialog"` + `aria-modal` + `aria-labelledby`;
 *   * focus moves into the dialog on open and returns to the trigger on close;
 *   * Tab is trapped inside while open;
 *   * Escape closes, and the page behind cannot scroll.
 */
import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';
import { classNames } from '../../utils/format.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE);
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;

    // Move focus to the first control, or the dialog itself.
    const timer = setTimeout(() => {
      const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE);
      if (focusable?.length) focusable[0].focus();
      else dialogRef.current?.focus();
    }, 0);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4"
      onKeyDown={handleKeyDown}
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={classNames(
          'relative z-10 w-full rounded-t-2xl bg-white shadow-2xl sm:rounded-xl',
          sizes[size] ?? sizes.md,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 p-5">
          <div className="min-w-0">
            {title ? (
              <h2 id={titleId} className="text-lg font-bold tracking-tight text-black">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm leading-6 text-neutral-600">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="-m-1 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-black"
            aria-label="Close dialog"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-5">{children}</div>

        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-neutral-200 bg-neutral-50 p-5 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirmation dialog for destructive actions.
 *
 * The confirm button is intentionally not the default focus target; the cancel
 * action receives focus so an accidental Enter is harmless.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  loading = false,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => cancelRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button ref={cancelRef} variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-neutral-700">{message}</p>
    </Modal>
  );
}

export default Modal;
