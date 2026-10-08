/**
 * Route guards.
 *
 * These improve the experience by not rendering pages the user cannot use, and
 * by sending them somewhere helpful. They are **not** the security boundary:
 * every protected endpoint independently verifies the session and role, so a
 * user who navigates directly to a URL still cannot read or change anything
 * they are not entitled to.
 */
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import { Navbar } from '../components/layout/Navbar.jsx';
import { ButtonLink, EmptyState, PageLoader } from '../components/ui/index.js';

/** Requires any signed-in account. */
export function RequireAuth({ children }) {
  const { isAuthenticated, isInitialising } = useAuth();
  const location = useLocation();

  if (isInitialising) return <PageLoader label="Checking your session…" />;

  if (!isAuthenticated) {
    // Remember where the user was heading so sign-in can return them there.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

/** Requires one of the given roles. */
export function RequireRole({ roles, children }) {
  const { isAuthenticated, isInitialising, role } = useAuth();
  const location = useLocation();

  if (isInitialising) return <PageLoader label="Checking your permissions…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!roles.includes(role)) {
    // The refusal is rendered inside the normal site chrome. These dashboard
    // routes sit outside the public layout, so without the navigation here a
    // user who followed a stale link would have no way back into the site.
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <Navbar />
        <main className="flex-1">
          <div className="container-page py-16">
            <EmptyState
              icon="lock"
              title="You do not have permission to view this page"
              description={`This area is limited to ${roles.join(' and ')} accounts. Your account is signed in as a ${role}.`}
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  <ButtonLink to="/attractions" variant="primary">
                    Back to attractions
                  </ButtonLink>
                  <ButtonLink to="/" variant="outline">
                    Go to the home page
                  </ButtonLink>
                </div>
              }
            />
          </div>
        </main>
      </div>
    );
  }

  return children;
}

export default RequireAuth;
