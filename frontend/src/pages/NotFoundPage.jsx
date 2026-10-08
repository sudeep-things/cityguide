/**
 * 404 page for unknown client routes.
 */
import { useDocumentTitle } from '../hooks/useApp.js';
import { ButtonLink, EmptyState } from '../components/ui/index.js';

export function NotFoundPage() {
  useDocumentTitle('Page not found');

  return (
    <div className="container-page py-20">
      <EmptyState
        icon="compass"
        title="That page does not exist"
        description="The link may be out of date, or the page may have been moved. Try browsing the attraction catalogue instead."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink to="/attractions" variant="primary">
              Browse attractions
            </ButtonLink>
            <ButtonLink to="/" variant="outline">
              Back to home
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}

export default NotFoundPage;
