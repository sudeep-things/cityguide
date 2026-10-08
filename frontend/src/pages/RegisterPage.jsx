/**
 * Registration page.
 *
 * Client-side validation mirrors the server's rules for quick feedback, but the
 * API enforces them independently — the password rules shown here are the same
 * ones the backend applies.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { AuthLayout } from '../layouts/AuthLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDocumentTitle } from '../hooks/useApp.js';
import { Alert, Button, Icon, TextField } from '../components/ui/index.js';

/** Live checklist so the password rules are visible while typing. */
function PasswordRequirements({ value }) {
  const rules = [
    { label: 'At least 8 characters', met: value.length >= 8 },
    { label: 'Contains a letter', met: /[A-Za-z]/.test(value) },
    { label: 'Contains a number', met: /[0-9]/.test(value) },
  ];

  return (
    <ul className="mt-2 space-y-1">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={`flex items-center gap-1.5 text-xs ${rule.met ? 'text-[#15803d]' : 'text-neutral-500'}`}
        >
          <Icon name={rule.met ? 'check' : 'minus'} className="h-3.5 w-3.5" />
          {rule.label}
          <span className="sr-only">{rule.met ? '— met' : '— not yet met'}</span>
        </li>
      ))}
    </ul>
  );
}

export function RegisterPage() {
  useDocumentTitle('Create your account');

  const { register, isRegistering, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);

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

    const errors = {};
    if (form.name.trim().length < 2) errors.name = 'Enter your name (at least 2 characters).';
    if (!form.email.trim()) errors.email = 'Enter your email address.';
    if (form.password.length < 8) errors.password = 'Passwords must be at least 8 characters long.';
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      errors.password = 'Passwords must contain at least one letter and one number.';
    }
    if (form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Those passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      const result = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      toast.success(`Welcome to CityGuide, ${result.user.name.split(' ')[0]}.`);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFieldErrors(error?.fieldErrors ?? {});
      setFormError(error?.message ?? 'We could not create your account. Please try again.');
    }
  }

  return (
    <AuthLayout
      title="Create your CityGuide account"
      subtitle="Save the places you like and arrange them into itineraries. It takes a moment."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <TextField
          label="Your name"
          name="name"
          value={form.name}
          onChange={(event) => updateField('name', event.target.value)}
          error={fieldErrors.name}
          autoComplete="name"
          placeholder="Ada Lovelace"
          required
        />

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

        <div>
          <TextField
            label="Password"
            type="password"
            name="password"
            value={form.password}
            onChange={(event) => updateField('password', event.target.value)}
            error={fieldErrors.password}
            autoComplete="new-password"
            placeholder="Choose a password"
            required
          />
          <PasswordRequirements value={form.password} />
        </div>

        <TextField
          label="Confirm password"
          type="password"
          name="confirmPassword"
          value={form.confirmPassword}
          onChange={(event) => updateField('confirmPassword', event.target.value)}
          error={fieldErrors.confirmPassword}
          autoComplete="new-password"
          placeholder="Repeat your password"
          required
        />

        <Button type="submit" variant="primary" size="lg" block loading={isRegistering}>
          {isRegistering ? 'Creating your account…' : 'Create account'}
        </Button>

        <p className="text-xs leading-5 text-neutral-500">
          New accounts start with the traveler role. Curator and administrator access is granted by an
          existing administrator.
        </p>
      </form>
    </AuthLayout>
  );
}

export default RegisterPage;
