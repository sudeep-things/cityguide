/**
 * Application entry point.
 *
 * Provider order matters:
 *   QueryClient   — the data layer, must wrap everything that fetches
 *   Toast         — notifications, used by the auth provider
 *   BrowserRouter — routing; wraps Auth so guards can navigate
 *   Auth          — session state, used by every guard and page
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // One retry is enough for a transient blip; more just delays the error.
      retry: (failureCount, error) => {
        // Authorization, validation and missing-resource failures are final.
        if ([401, 403, 404, 422].includes(error?.status)) return false;
        return failureCount < 1;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      gcTime: 5 * 60_000,
    },
    mutations: {
      retry: false,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
