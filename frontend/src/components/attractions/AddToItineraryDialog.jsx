/**
 * "Add to itinerary" dialog.
 *
 * Lets a traveler drop an attraction into an existing plan or create a new one
 * on the spot. Both paths write through the API, so the stop survives a refresh
 * and the ordering constraint is enforced server-side.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import { itineraryService } from '../../services/resources.js';
import { queryKeys } from '../../services/queryKeys.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Alert,
  Button,
  EmptyState,
  Icon,
  InlineError,
  Modal,
  SkeletonRows,
  TextField,
} from '../ui/index.js';
import { classNames } from '../../utils/format.js';

export function AddToItineraryDialog({ attraction, open, onClose }) {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState(null);

  const itinerariesQuery = useQuery({
    queryKey: queryKeys.itineraries,
    queryFn: () => itineraryService.list(),
    enabled: open && isAuthenticated,
  });

  const itineraries = itinerariesQuery.data?.items ?? [];

  // Reset transient state each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setCreatingNew(false);
    setNewName('');
    setNameError(null);
  }, [open]);

  // Preselect the first plan once the list arrives and nothing is chosen.
  useEffect(() => {
    if (!open || selectedId !== null || creatingNew) return;
    if (itineraries.length > 0) setSelectedId(itineraries[0].id);
  }, [open, itineraries, selectedId, creatingNew]);

  function refreshItineraryCaches(itineraryId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.itineraries });
    if (itineraryId) queryClient.invalidateQueries({ queryKey: queryKeys.itinerary(itineraryId) });
  }

  const addMutation = useMutation({
    mutationFn: (itineraryId) =>
      itineraryService.addItem(itineraryId, { attractionId: attraction.id }),
    onSuccess: (_result, itineraryId) => {
      refreshItineraryCaches(itineraryId);
      toast.success(`Added “${attraction.name}” to your itinerary.`);
      onClose?.();
    },
    onError: (error) => {
      // A duplicate is not really a failure from the traveler's point of view.
      if (error?.code === 'DUPLICATE_RESOURCE') {
        refreshItineraryCaches(selectedId);
        toast.info(`“${attraction.name}” is already in that itinerary.`);
        onClose?.();
        return;
      }
      toast.error(error?.message ?? 'We could not add that stop to your itinerary.');
    },
  });

  const createAndAddMutation = useMutation({
    mutationFn: async (name) => {
      const created = await itineraryService.create({ name });
      const itineraryId = created.itinerary.id;
      await itineraryService.addItem(itineraryId, { attractionId: attraction.id });
      return itineraryId;
    },
    onSuccess: (itineraryId) => {
      refreshItineraryCaches(itineraryId);
      toast.success(`Created the itinerary and added “${attraction.name}”.`);
      onClose?.();
      navigate(`/itineraries/${itineraryId}`);
    },
    onError: (error) => {
      const fieldErrors = error?.fieldErrors ?? {};
      if (fieldErrors.name) setNameError(fieldErrors.name);
      else toast.error(error?.message ?? 'We could not create that itinerary.');
    },
  });

  const pending = addMutation.isPending || createAndAddMutation.isPending;

  function handleSubmit(event) {
    event.preventDefault();

    if (creatingNew) {
      const trimmed = newName.trim();
      if (trimmed.length < 2) {
        setNameError('Give your itinerary a name of at least 2 characters.');
        return;
      }
      setNameError(null);
      createAndAddMutation.mutate(trimmed);
      return;
    }

    if (!selectedId) {
      toast.info('Choose an itinerary first.');
      return;
    }
    addMutation.mutate(selectedId);
  }

  // Signed-out visitors are pointed at sign-in rather than shown a dead end.
  if (!isAuthenticated) {
    return (
      <Modal open={open} onClose={onClose} title="Add to itinerary" size="sm">
        <Alert variant="info" title="Sign in to build itineraries">
          Itineraries are saved to your account so you can come back to them later.
        </Alert>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="primary"
            block
            onClick={() => {
              onClose?.();
              navigate('/login', { state: { from: location } });
            }}
          >
            Sign in
          </Button>
          <Button variant="outline" block onClick={onClose}>
            Not now
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Add to itinerary"
      description={`Choose where “${attraction.name}” should go in your plan.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={pending}
            disabled={!creatingNew && !selectedId}
          >
            <Icon name="plus" className="h-4 w-4" />
            {creatingNew ? 'Create and add' : 'Add to itinerary'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {itinerariesQuery.isPending ? (
          <SkeletonRows count={3} />
        ) : itinerariesQuery.isError ? (
          <Alert variant="error" title="Unable to load your itineraries">
            {itinerariesQuery.error?.message ?? 'Please try again.'}
          </Alert>
        ) : (
          <>
            {itineraries.length > 0 ? (
              <fieldset>
                <legend className="label">Your itineraries</legend>
                <div className="space-y-2">
                  {itineraries.map((itinerary) => (
                    <label
                      key={itinerary.id}
                      className={classNames(
                        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                        !creatingNew && selectedId === itinerary.id
                          ? 'border-cobalt-600 bg-cobalt-50'
                          : 'border-neutral-200 hover:border-neutral-300',
                      )}
                    >
                      <input
                        type="radio"
                        name="itinerary"
                        className="mt-1 h-4 w-4 accent-[#0047AB]"
                        checked={!creatingNew && selectedId === itinerary.id}
                        onChange={() => {
                          setCreatingNew(false);
                          setSelectedId(itinerary.id);
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-black">
                          {itinerary.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-neutral-500">
                          {itinerary.itemCount === 0
                            ? 'Empty itinerary'
                            : `${itinerary.itemCount} ${itinerary.itemCount === 1 ? 'stop' : 'stops'}`}
                        </span>
                      </span>
                      {!creatingNew && selectedId === itinerary.id ? (
                        <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-cobalt-600" />
                      ) : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <EmptyState
                icon="route"
                title="You have no itineraries yet"
                description="Create your first plan and this place will be its first stop."
                className="py-10"
              />
            )}
          </>
        )}

        <div className="border-t border-neutral-200 pt-5">
          {creatingNew ? (
            <div className="space-y-3">
              <TextField
                label="New itinerary name"
                placeholder="A weekend in the city"
                value={newName}
                onChange={(event) => {
                  setNewName(event.target.value);
                  if (nameError) setNameError(null);
                }}
                error={nameError}
                maxLength={120}
                autoFocus
                required
              />
              {itineraries.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setCreatingNew(false)}>
                  <Icon name="chevron-left" className="h-4 w-4" />
                  Choose an existing itinerary instead
                </Button>
              ) : null}
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setCreatingNew(true)}>
              <Icon name="plus" className="h-4 w-4" />
              Create a new itinerary
            </Button>
          )}
        </div>

        {addMutation.isError && addMutation.error?.code !== 'DUPLICATE_RESOURCE' ? (
          <InlineError>{addMutation.error.message}</InlineError>
        ) : null}
      </form>
    </Modal>
  );
}

export default AddToItineraryDialog;
