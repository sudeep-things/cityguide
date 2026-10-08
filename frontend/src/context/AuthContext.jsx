/**
 * Authentication state.
 *
 * The session lives in an httpOnly cookie, so the browser cannot read it. The
 * source of truth is therefore the API: `GET /auth/me` is fetched once and
 * cached by React Query, and signing in or out invalidates that cache.
 *
 * Role helpers are provided for convenience in the UI only. Every privileged
 * action is re-checked by the backend, which is the actual security boundary.
 */
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authService } from '../services/resources.js';
import { queryKeys } from '../services/queryKeys.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isFetched,
    refetch: refetchIdentity,
  } = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authService.me(),
    // A 401 here is an expected "signed out" answer, not a failure to retry.
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  /** Drops every cached resource that was scoped to the previous identity. */
  const clearPrivateCaches = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['saved-places'] });
    queryClient.removeQueries({ queryKey: ['itineraries'] });
    queryClient.removeQueries({ queryKey: ['itinerary'] });
    queryClient.removeQueries({ queryKey: ['profile'] });
    queryClient.removeQueries({ queryKey: ['admin'] });
    queryClient.removeQueries({ queryKey: ['curator'] });
    // Public lists embed a per-viewer `isSaved` flag, so refresh them too.
    queryClient.invalidateQueries({ queryKey: ['attractions'] });
  }, [queryClient]);

  const loginMutation = useMutation({
    mutationFn: (credentials) => authService.login(credentials),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.me, {
        authenticated: true,
        user: result.user,
      });
      clearPrivateCaches();
    },
  });

  const registerMutation = useMutation({
    mutationFn: (payload) => authService.register(payload),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.me, {
        authenticated: true,
        user: result.user,
      });
      clearPrivateCaches();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(),
    onSettled: () => {
      queryClient.setQueryData(queryKeys.me, { authenticated: false, user: null });
      clearPrivateCaches();
    },
  });

  const user = data?.user ?? null;

  const value = useMemo(
    () => ({
      user,
      stats: data?.stats ?? null,
      /** True until the first identity check resolves. */
      isInitialising: isLoading && !isFetched,
      isAuthenticated: Boolean(user),
      role: user?.role ?? null,
      isTraveler: user?.role === 'traveler',
      isCurator: user?.role === 'curator' || user?.role === 'admin',
      isAdmin: user?.role === 'admin',

      login: (credentials) => loginMutation.mutateAsync(credentials),
      register: (payload) => registerMutation.mutateAsync(payload),
      logout: () => logoutMutation.mutateAsync(),

      isLoggingIn: loginMutation.isPending,
      isRegistering: registerMutation.isPending,
      isLoggingOut: logoutMutation.isPending,

      refresh: refetchIdentity,
    }),
    [
      user,
      data?.stats,
      isLoading,
      isFetched,
      loginMutation,
      registerMutation,
      logoutMutation,
      refetchIdentity,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}
