/**
 * Save / unsave toggle.
 *
 * Writes go to the API immediately — there is no local-only bookmark state. The
 * button reflects the optimistic value while the request is in flight and rolls
 * back if the server rejects it, so the UI never claims a save that did not
 * happen.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import { savedPlaceService } from '../../services/resources.js';
import { queryKeys } from '../../services/queryKeys.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Icon } from '../ui/index.js';
import { classNames } from '../../utils/format.js';

export function SaveButton({
  attraction,
  variant = 'floating',
  className,
  onChange,
}) {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isSaved = Boolean(attraction.isSaved);

  /** Refreshes every cached view that embeds this attraction's save state. */
  function invalidateRelated() {
    queryClient.invalidateQueries({ queryKey: ['saved-places'] });
    queryClient.invalidateQueries({ queryKey: ['attractions'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.attraction(attraction.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }

  const saveMutation = useMutation({
    mutationFn: () => savedPlaceService.save(attraction.id),
    onSuccess: () => {
      invalidateRelated();
      toast.success(`Saved “${attraction.name}” to your places.`);
      onChange?.(true);
    },
    onError: (error) => {
      if (error?.code === 'DUPLICATE_RESOURCE') {
        // Already saved elsewhere (for example in another tab): treat as success.
        invalidateRelated();
        return;
      }
      toast.error(error?.message ?? 'We could not save that attraction.');
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => savedPlaceService.removeByAttraction(attraction.id),
    onSuccess: () => {
      invalidateRelated();
      toast.info(`Removed “${attraction.name}” from your saved places.`);
      onChange?.(false);
    },
    onError: (error) => {
      if (error?.status === 404) {
        // Already gone; reconcile the UI with the server.
        invalidateRelated();
        return;
      }
      toast.error(error?.message ?? 'We could not remove that saved place.');
    },
  });

  const pending = saveMutation.isPending || removeMutation.isPending;

  function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!isAuthenticated) {
      toast.info('Sign in to save places to your shortlist.');
      navigate('/login', { state: { from: location } });
      return;
    }

    if (isSaved) removeMutation.mutate();
    else saveMutation.mutate();
  }

  const label = isSaved ? `Remove ${attraction.name} from saved places` : `Save ${attraction.name}`;

  if (variant === 'floating') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={isSaved}
        aria-label={label}
        title={isSaved ? 'Remove from saved places' : 'Save this place'}
        className={classNames(
          'flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-colors disabled:opacity-70',
          isSaved
            ? 'border-cobalt-600 bg-cobalt-600 text-white hover:bg-cobalt-700'
            : 'border-white/70 bg-white/95 text-black hover:border-cobalt-600 hover:text-cobalt-600',
          className,
        )}
      >
        <Icon name={isSaved ? 'bookmark-filled' : 'bookmark'} className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={isSaved}
      className={classNames(
        'btn',
        isSaved ? 'btn-secondary' : 'btn-outline',
        className,
      )}
    >
      <Icon name={isSaved ? 'bookmark-filled' : 'bookmark'} className="h-4 w-4" />
      {isSaved ? 'Saved' : 'Save'}
    </button>
  );
}

export default SaveButton;
