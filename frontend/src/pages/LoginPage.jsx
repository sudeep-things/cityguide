/**
 * Sign-in page.
 *
 * Includes a demo-account panel because this is a demonstration deployment and
 * the seeded roles (curator, administrator) cannot be self-assigned through the
 * API. The panel is clearly marked as demo-only.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { AuthLayout } from '../layouts/AuthLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDocumentTitle } from '../hooks/useApp.js';
import { Alert, Button, Icon, InlineError, TextField } from '../components/ui/index.js';

const DEMO_ACCOUNTS = [
  { role: 'Traveler', email: 'traveler@cityguide.test', password: 'Traveler123!' },
  { role: 'Curator', email: 'curator@cityguide.test', password: 'Curator123!' },
  { role: 'Administrator', email: 'admin@cityguide.test', password: 'Admin123!' },
];

export function LoginPage() {
  useDocumentTitle('Sign in');

  const { login, isLoggingIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);

  // Return the user to wherever they were heading before being redirected here.
  const redirectTo = location.state?.from?.pathname ?? '/attractions';

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((current) => ({ ...current, [name]: undefined }));
    if (formError) setFormError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);

    // Client-side checks are for fast feedback only; the API validates again.
    const errors = {};
    if (!form.email.trim()) errors.email = 'Enter your email address.';
    if (!form.password) errors.password = 'Enter your password.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      const result = await login({
        email: form.email.trim(),
        password: form.password,
      });
      toast.success(`Welcome back, ${result.user.name.split(' ')[0]}.`);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFieldErrors(error?.fieldErrors ?? {});
      setFormError(error?.message ?? 'We could not sign you in. Please try again.');
    }
  }

  return (
    <AuthLayout
      title="Sign in to CityGuide"
      subtitle="Pick up your saved places and itineraries where you left them."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <TextField
          label="Email address"
          type="email"
          name="email"
          value={form.email}
          onChange={(event) => updateField('email', event.target.value)}
          error={fieldErrors.email}
          autoComplete="email"
          placeholder="you@example.com"
          required
        />

        <TextField
          label="Password"
          type="password"
          name="password"
          value={form.password}
          onChange={(event) => updateField('password', event.target.value)}
          error={fieldErrors.password}
          autoComplete="current-password"
          placeholder="Your password"
          required
        />

        <Button type="submit" variant="primary" size="lg" block loading={isLoggingIn}>
          {isLoggingIn ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* Demo accounts ---------------------------------------------------- */}
      <section className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-black">
          <Icon name="info" className="h-4 w-4 text-cobalt-600" />
          Demo accounts
        </h2>
        <p className="mt-1 text-xs leading-5 text-neutral-600">
          Seeded for demonstration. Each role sees a different part of the application.
        </p>

        <ul className="mt-3 space-y-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => {
                  setForm({ email: account.email, password: account.password });
                  setFieldErrors({});
                  setFormError(null);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left transition-colors hover:border-cobalt-300 hover:bg-cobalt-50"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-cobalt-700">{account.role}</span>
                  <span className="block truncate text-xs text-neutral-600">{account.email}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-neutral-500">Use →</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </AuthLayout>
  );
}

export default LoginPage;
