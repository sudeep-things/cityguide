/**
 * Traveler profile.
 *
 * Shows only the signed-in account's own information — there is no route that
 * exposes another user's private data. Profile and password changes both go
 * through the API, and changing the password invalidates every other session.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { userService } from '../services/resources.js';
import { queryKeys } from '../services/queryKeys.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDocumentTitle } from '../hooks/useApp.js';
import {
  Alert,
  Avatar,
  Button,
  ButtonLink,
  DetailRow,
  ErrorState,
  Icon,
  InlineError,
  RoleBadge,
  SectionHeading,
  Skeleton,
  SkeletonText,
  StatCard,
  TextField,
} from '../components/ui/index.js';
import { formatDate } from '../utils/format.js';

/** Name and email update form. */
function ProfileDetailsForm({ user }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ name: user.name, email: user.email });
  const [errors, setErrors] = useState({});

  // Keep the form in step if the account changes underneath it.
  useEffect(() => {
    setForm({ name: user.name, email: user.email });
  }, [user.name, user.email]);

  const mutation = useMutation({
    mutationFn: (payload) => userService.updateProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      toast.success('Your profile has been updated.');
      setErrors({});
    },
    onError: (error) => {
      const fieldErrors = error?.fieldErrors ?? {};
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) {
        toast.error(error?.message ?? 'We could not update your profile.');
      }
    },
  });

  const isDirty = form.name !== user.name || form.email !== user.email;

  function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = {};
    if (form.name.trim().length < 2) nextErrors.name = 'Enter your name (at least 2 characters).';
    if (!form.email.trim()) nextErrors.email = 'Enter your email address.';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    mutation.mutate({ name: form.name.trim(), email: form.email.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <TextField
        label="Full name"
        value={form.name}
        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        error={errors.name}
        autoComplete="name"
        required
      />

      <TextField
        label="Email address"
        type="email"
        value={form.email}
        onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
        error={errors.email}
        hint="Used to sign in. Changing it takes effect immediately."
        autoComplete="email"
        required
      />

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={mutation.isPending} disabled={!isDirty}>
          Save changes
        </Button>
        {isDirty ? (
          <Button
            variant="ghost"
            onClick={() => {
              setForm({ name: user.name, email: user.email });
              setErrors({});
            }}
          >
            Reset
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Password change form. */
function ChangePasswordForm() {
  const toast = useToast();

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});

  const mutation = useMutation({
    mutationFn: (payload) => userService.changePassword(payload),
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setErrors({});
      toast.success('Your password has been changed. Other sessions have been signed out.');
    },
    onError: (error) => {
      const fieldErrors = error?.fieldErrors ?? {};
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) {
        toast.error(error?.message ?? 'We could not change your password.');
      }
    },
  });

  function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = {};
    if (!form.currentPassword) nextErrors.currentPassword = 'Enter your current password.';
    if (form.newPassword.length < 8) {
      nextErrors.newPassword = 'Passwords must be at least 8 characters long.';
    } else if (!/[A-Za-z]/.test(form.newPassword) || !/[0-9]/.test(form.newPassword)) {
      nextErrors.newPassword = 'Passwords must contain at least one letter and one number.';
    }
    if (form.newPassword !== form.confirmPassword) {
      nextErrors.confirmPassword = 'Those passwords do not match.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    mutation.mutate({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <TextField
        label="Current password"
        type="password"
        value={form.currentPassword}
        onChange={(event) =>
          setForm((current) => ({ ...current, currentPassword: event.target.value }))
        }
        error={errors.currentPassword}
        autoComplete="current-password"
        required
      />

      <TextField
        label="New password"
        type="password"
        value={form.newPassword}
        onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))}
        error={errors.newPassword}
        hint="At least 8 characters, including a letter and a number."
        autoComplete="new-password"
        required
      />

      <TextField
        label="Confirm new password"
        type="password"
        value={form.confirmPassword}
        onChange={(event) =>
          setForm((current) => ({ ...current, confirmPassword: event.target.value }))
        }
        error={errors.confirmPassword}
        autoComplete="new-password"
        required
      />

      <Button type="submit" variant="primary" loading={mutation.isPending}>
        Change password
      </Button>
    </form>
  );
}

export function ProfilePage() {
  useDocumentTitle('Profile');

  const { user, logout, isLoggingOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => userService.profile(),
  });

  const stats = profileQuery.data?.stats ?? null;

  async function handleSignOut() {
    try {
      await logout();
      toast.success('You have been signed out.');
      navigate('/');
    } catch {
      toast.error('We could not sign you out. Please try again.');
    }
  }

  return (
    <div className="container-page py-8 sm:py-10">
      <SectionHeading
        level={1}
        title="Your profile"
        description="Your account details, travel statistics and security settings."
      />

      {/* Overview ------------------------------------------------------- */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="card h-fit p-6">
          <div className="flex items-center gap-4">
            <Avatar name={user.name} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-black">{user.name}</p>
              <p className="truncate text-sm text-neutral-600">{user.email}</p>
              <div className="mt-2">
                <RoleBadge role={user.role} />
              </div>
            </div>
          </div>

          <dl className="mt-6">
            <DetailRow label="Account ID" icon="shield">
              <span className="font-mono text-sm">#{user.id}</span>
            </DetailRow>
            <DetailRow label="Member since" icon="calendar">
              {formatDate(user.createdAt)}
            </DetailRow>
            <DetailRow label="Last updated" icon="clock">
              {formatDate(user.updatedAt)}
            </DetailRow>
          </dl>

          <div className="mt-6 flex flex-col gap-2">
            {user.role === 'curator' || user.role === 'admin' ? (
              <ButtonLink to="/curator" variant="outline" block>
                <Icon name="pencil" className="h-4 w-4" />
                Curator dashboard
              </ButtonLink>
            ) : null}
            {user.role === 'admin' ? (
              <ButtonLink to="/admin" variant="outline" block>
                <Icon name="shield" className="h-4 w-4" />
                Admin dashboard
              </ButtonLink>
            ) : null}
            <Button variant="ghost" block onClick={handleSignOut} loading={isLoggingOut}>
              <Icon name="logout" className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Statistics */}
          <div className="grid gap-4 sm:grid-cols-3">
            {profileQuery.isPending ? (
              <>
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
              </>
            ) : profileQuery.isError ? (
              <div className="sm:col-span-3">
                <ErrorState
                  title="Unable to load your statistics"
                  message={profileQuery.error?.message}
                  onRetry={() => profileQuery.refetch()}
                />
              </div>
            ) : (
              <>
                <StatCard
                  label="Saved places"
                  value={stats?.savedPlaces ?? 0}
                  icon="bookmark"
                  tone="cobalt"
                />
                <StatCard
                  label="Itineraries"
                  value={stats?.itineraryCount ?? 0}
                  icon="route"
                  tone="cobalt"
                />
                <StatCard
                  label="Planned stops"
                  value={stats?.itineraryStops ?? 0}
                  icon="map-pin"
                  tone="cobalt"
                />
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/saved" variant="outline">
              <Icon name="bookmark" className="h-4 w-4" />
              View saved places
            </ButtonLink>
            <ButtonLink to="/itineraries" variant="outline">
              <Icon name="route" className="h-4 w-4" />
              View itineraries
            </ButtonLink>
          </div>

          {/* Account details */}
          <section className="card p-6" aria-labelledby="details-heading">
            <h2 id="details-heading" className="text-lg font-bold text-black">
              Account details
            </h2>
            <p className="mt-1.5 text-sm text-neutral-600">
              Update the name and email address on your account.
            </p>
            <div className="mt-5">
              {profileQuery.isPending ? <SkeletonText lines={3} /> : <ProfileDetailsForm user={user} />}
            </div>
          </section>

          {/* Security */}
          <section className="card p-6" aria-labelledby="security-heading">
            <h2 id="security-heading" className="text-lg font-bold text-black">
              Password
            </h2>
            <p className="mt-1.5 text-sm text-neutral-600">
              Changing your password signs out every other device.
            </p>

            <div className="mt-5">
              <ChangePasswordForm />
            </div>

            <Alert variant="info" className="mt-5">
              Passwords are stored as scrypt hashes with a unique salt per account. Nobody — including
              administrators — can read your password.
            </Alert>
          </section>

          <p className="text-sm text-neutral-600">
            Looking for something else?{' '}
            <Link to="/attractions" className="link">
              Browse the attraction catalogue
            </Link>
            .
          </p>
        </div>
      </div>

      {profileQuery.isError ? (
        <div className="mt-6">
          <InlineError>{profileQuery.error?.message}</InlineError>
        </div>
      ) : null}
    </div>
  );
}

export default ProfilePage;
