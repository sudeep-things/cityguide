/**
 * Form controls.
 *
 * Every control wires up a label, `aria-invalid`, and `aria-describedby` so the
 * error and hint text are announced. Errors are also rendered with an icon, so
 * the invalid state never depends on colour alone.
 */
import { forwardRef, useId } from 'react';

import { Icon } from './Icon.jsx';
import { classNames } from '../../utils/format.js';

/** Wraps any control with a label, error message and hint text. */
export function Field({ label, htmlFor, error, hint, required, children, className }) {
  return (
    <div className={className}>
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required ? (
            <span className="ml-0.5 text-[#b91c1c]" aria-hidden="true">
              *
            </span>
          ) : null}
          {required ? <span className="sr-only"> (required)</span> : null}
        </label>
      ) : null}

      {children}

      {error ? (
        <p className="field-error" id={htmlFor ? `${htmlFor}-error` : undefined}>
          <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      {hint && !error ? (
        <p className="field-hint" id={htmlFor ? `${htmlFor}-hint` : undefined}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id, error, hint) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export const TextField = forwardRef(function TextField(
  { label, error, hint, required, id, className, containerClassName, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field
      label={label}
      htmlFor={inputId}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      <input
        ref={ref}
        id={inputId}
        className={classNames('input', error && 'input-invalid', className)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        required={required}
        {...rest}
      />
    </Field>
  );
});

export const TextAreaField = forwardRef(function TextAreaField(
  { label, error, hint, required, id, rows = 4, className, containerClassName, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field
      label={label}
      htmlFor={inputId}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        className={classNames('textarea', error && 'input-invalid', className)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        required={required}
        {...rest}
      />
    </Field>
  );
});

/**
 * Native `<select>`, deliberately: it is fully keyboard accessible and works on
 * mobile without custom code.
 */
export const SelectField = forwardRef(function SelectField(
  { label, error, hint, required, id, className, containerClassName, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field
      label={label}
      htmlFor={inputId}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      <select
        ref={ref}
        id={inputId}
        className={classNames('select', error && 'input-invalid', className)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        required={required}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
});

/** Read-only key/value row used on detail and profile pages. */
export function DetailRow({ label, children, icon }) {
  return (
    <div className="flex flex-col gap-1 border-b border-neutral-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="flex w-full items-center gap-2 text-sm font-semibold text-black sm:w-44 sm:shrink-0">
        {icon ? <Icon name={icon} className="h-4 w-4 text-cobalt-600" /> : null}
        {label}
      </dt>
      <dd className="min-w-0 text-sm text-neutral-700">{children}</dd>
    </div>
  );
}

export default TextField;
