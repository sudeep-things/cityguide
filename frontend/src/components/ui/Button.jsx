/**
 * Buttons.
 *
 * Variants map onto the design-system classes in `styles/index.css`, so the
 * palette stays defined in exactly one place.
 */
import { Link } from 'react-router-dom';

import Spinner from './Spinner.jsx';
import { classNames } from '../../utils/format.js';

const VARIANT_CLASSES = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

const SIZE_CLASSES = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

function classesFor({ variant, size, className, block }) {
  return classNames(
    'btn',
    VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary,
    SIZE_CLASSES[size] ?? '',
    block ? 'w-full' : '',
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  className,
  children,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      className={classesFor({ variant, size, className, block })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

/** Same styling, rendered as a router link. */
export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  children,
  ...rest
}) {
  return (
    <Link to={to} className={classesFor({ variant, size, className, block })} {...rest}>
      {children}
    </Link>
  );
}

/** Same styling, rendered as an anchor for external destinations. */
export function ButtonAnchor({
  href,
  variant = 'outline',
  size = 'md',
  block = false,
  className,
  children,
  ...rest
}) {
  return (
    <a
      href={href}
      className={classesFor({ variant, size, className, block })}
      target="_blank"
      rel="noreferrer noopener"
      {...rest}
    >
      {children}
    </a>
  );
}

export default Button;
