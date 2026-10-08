/**
 * Public site shell: skip link, navigation, routed content, footer.
 */
import { Outlet } from 'react-router-dom';

import { Navbar } from '../components/layout/Navbar.jsx';
import { Footer } from '../components/layout/Footer.jsx';

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Keyboard users can jump straight past the navigation. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-cobalt-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      <Navbar />

      <main id="main-content" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}

export default AppLayout;
