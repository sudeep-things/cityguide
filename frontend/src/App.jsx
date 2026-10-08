/**
 * Routing table.
 *
 * Route guards (`RequireAuth`, `RequireRole`) decide what to render; they are a
 * usability layer only. Every protected resource is independently authorized by
 * the API, so navigating directly to a URL grants nothing.
 */
import { Route, Routes } from 'react-router-dom';

import { AppLayout } from './layouts/AppLayout.jsx';
import { DashboardLayout } from './layouts/DashboardLayout.jsx';
import { RequireAuth, RequireRole } from './routes/guards.jsx';

import { LandingPage } from './pages/LandingPage.jsx';
import { AttractionsPage } from './pages/AttractionsPage.jsx';
import { AttractionDetailPage } from './pages/AttractionDetailPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { SavedPlacesPage } from './pages/SavedPlacesPage.jsx';
import { ItinerariesPage } from './pages/ItinerariesPage.jsx';
import { ItineraryDetailPage } from './pages/ItineraryDetailPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

import { CuratorOverviewPage } from './pages/curator/CuratorOverviewPage.jsx';
import { AttractionManagementPage } from './pages/curator/AttractionManagementPage.jsx';
import { AttractionFormPage } from './pages/curator/AttractionFormPage.jsx';
import { CategoryManagementPage } from './pages/curator/CategoryManagementPage.jsx';

import { AdminOverviewPage } from './pages/admin/AdminOverviewPage.jsx';
import { AdminUsersPage } from './pages/admin/AdminUsersPage.jsx';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage.jsx';

const CURATOR_SECTIONS = [
  { to: '/curator', label: 'Overview', icon: 'dashboard', end: true },
  { to: '/curator/attractions', label: 'Attractions', icon: 'compass' },
  { to: '/curator/categories', label: 'Categories', icon: 'layers' },
];

const ADMIN_SECTIONS = [
  { to: '/admin', label: 'Overview', icon: 'dashboard', end: true },
  { to: '/admin/users', label: 'Users', icon: 'users' },
  { to: '/admin/attractions', label: 'Attractions', icon: 'compass' },
  { to: '/admin/categories', label: 'Categories', icon: 'layers' },
  { to: '/admin/audit-logs', label: 'Audit logs', icon: 'list' },
];

/** Curator area shell. Administrators may use it too. */
function CuratorLayout() {
  return (
    <DashboardLayout
      title="Curator dashboard"
      description="Create and maintain the attraction catalogue, its categories and its location data."
      sections={CURATOR_SECTIONS}
    />
  );
}

/** Administrator area shell. */
function AdminLayout() {
  return (
    <DashboardLayout
      title="Admin dashboard"
      description="Manage accounts and roles, oversee the catalogue, and review the audit trail."
      sections={ADMIN_SECTIONS}
    />
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public site */}
      <Route element={<AppLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="attractions" element={<AttractionsPage />} />
        <Route path="attractions/:id" element={<AttractionDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        {/* Traveler-only */}
        <Route
          path="saved"
          element={
            <RequireAuth>
              <SavedPlacesPage />
            </RequireAuth>
          }
        />
        <Route
          path="itineraries"
          element={
            <RequireAuth>
              <ItinerariesPage />
            </RequireAuth>
          }
        />
        <Route
          path="itineraries/:id"
          element={
            <RequireAuth>
              <ItineraryDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Curator area */}
      <Route
        path="/curator"
        element={
          <RequireRole roles={['curator', 'admin']}>
            <CuratorLayout />
          </RequireRole>
        }
      >
        <Route index element={<CuratorOverviewPage basePath="/curator" />} />
        <Route
          path="attractions"
          element={<AttractionManagementPage basePath="/curator" />}
        />
        <Route path="attractions/new" element={<AttractionFormPage basePath="/curator" />} />
        <Route
          path="attractions/:id/edit"
          element={<AttractionFormPage basePath="/curator" />}
        />
        <Route path="categories" element={<CategoryManagementPage />} />
      </Route>

      {/* Administrator area */}
      <Route
        path="/admin"
        element={
          <RequireRole roles={['admin']}>
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<AdminOverviewPage basePath="/admin" />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="attractions" element={<AttractionManagementPage basePath="/admin" />} />
        <Route path="attractions/new" element={<AttractionFormPage basePath="/admin" />} />
        <Route path="attractions/:id/edit" element={<AttractionFormPage basePath="/admin" />} />
        <Route path="categories" element={<CategoryManagementPage />} />
        <Route path="audit-logs" element={<AdminAuditLogsPage />} />
      </Route>
    </Routes>
  );
}
