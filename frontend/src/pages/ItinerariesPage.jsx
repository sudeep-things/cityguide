/**
 * Itinerary list.
 *
 * Each card shows the stored stop count, which comes from the database rather
 * than from any client-side cache, so the figures survive a refresh.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { itineraryService } from '../services/resources.js';
import { queryKeys } from '../services/queryKeys.js';
import { useDocumentTitle } from '../hooks/useApp.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Button,
  ButtonLink,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  InlineError,
  Modal,
  SectionHeading,
  SkeletonRows,
  TextAreaField,
  TextField,
} from '../components/ui/index.js';
import { formatRelative } from '../utils/format.js';

/**
 * Create / rename dialog, shared by both flows.
 *
 * Mounted only while open, so its state starts fresh every time and there is no
 * stale value to reset.
 */
function ItineraryFormDialog({ onClose, itinerary = null }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEditing = Boolean(itinerary);

  const [name, setName] = useState(itinerary?.name ?? '');
  const [description, setDescription] = useState(itinerary?.description ?? '');
  const [errors, setErrors] = useState({});

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      isEditing ? itineraryService.update(itinerary.id, payload) : itineraryService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.itineraries });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      toast.success(isEditing ? 'Itinerary updated.' : 'Itinerary created.');
      onClose();
    },
    onError: (error) => {
      setErrors(error?.fieldErrors ?? {});
      if (!Object.keys(error?.fieldErrors ?? {}).length) {
        toast.error(error?.message ?? 'We could not save that itinerary.');
      }
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setErrors({ name: 'Give your itinerary a name of at least 2 characters.' });
      return;
    }
    setErrors({});
    saveMutation.mutate({
      name: trimmed,
      description: description.trim() === '' ? null : description.trim(),
    });
  }

  return (
    <Modal
      open
      onClose={saveMutation.isPending ? () => {} : onClose}
      title={isEditing ? 'Edit itinerary' : 'New itinerary'}
      description={
        isEditing
          ? 'Update the name or description of this plan.'
          : 'Give your plan a name. You can add stops straight after.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={saveMutation.isPending}>
            {isEditing ? 'Save changes' : 'Create itinerary'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <TextField
          label="Itinerary name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          placeholder="A weekend in the city"
          maxLength={120}
          autoFocus
          required
        />

        <TextAreaField
          label="Description (optional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          placeholder="What is this plan for?"
          rows={3}
          maxLength={1000}
        />

        {saveMutation.isError && !Object.keys(errors).length ? (
          <InlineError>{saveMutation.error?.message}</InlineError>
        ) : null}
      </form>
    </Modal>
  );
}

export function ItinerariesPage() {
  useDocumentTitle('My itineraries');

  const toast = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const itinerariesQuery = useQuery({
    queryKey: queryKeys.itineraries,
    queryFn: () => itineraryService.list(),
  });

  const itineraries = itinerariesQuery.data?.items ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id) => itineraryService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.itineraries });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      toast.success('Itinerary deleted.');
      setPendingDelete(null);
    },
    onError: (error) => {
      toast.error(error?.message ?? 'We could not delete that itinerary.');
      setPendingDelete(null);
    },
  });

  return (
    <div className="container-page py-8 sm:py-10">
      <SectionHeading
        level={1}
        title="My itineraries"
        description="Private day plans, ordered exactly how you want to visit them. Only you can see these."
        action={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" className="h-4 w-4" />
            New itinerary
          </Button>
        }
      />

      <div className="mt-8">
        {itinerariesQuery.isPending ? (
          <div className="card p-6">
            <SkeletonRows count={3} />
          </div>
        ) : itinerariesQuery.isError ? (
          <ErrorState
            title="Unable to load your itineraries"
            message={itinerariesQuery.error?.message ?? 'Please try again.'}
            onRetry={() => itinerariesQuery.refetch()}
          />
        ) : itineraries.length === 0 ? (
          <EmptyState
            icon="route"
            title="You have not created an itinerary yet"
            description="Group the places you want to visit into an ordered plan. Add stops from any attraction page."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  <Icon name="plus" className="h-4 w-4" />
                  Create your first itinerary
                </Button>
                <ButtonLink to="/attractions" variant="outline">
                  Browse attractions
                </ButtonLink>
              </div>
            }
          />
        ) : (
          <ul className="grid gap-5 lg:grid-cols-2">
            {itineraries.map((itinerary) => (
              <li key={itinerary.id} className="card card-interactive flex flex-col p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold tracking-tight text-black">
                      <Link to={`/itineraries/${itinerary.id}`} className="hover:text-cobalt-700">
                        {itinerary.name}
                      </Link>
                    </h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="route" className="h-3.5 w-3.5 text-cobalt-600" />
                        {itinerary.itemCount} {itinerary.itemCount === 1 ? 'stop' : 'stops'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Icon name="clock" className="h-3.5 w-3.5" />
                        Updated {formatRelative(itinerary.updatedAt)}
                      </span>
                    </p>
                  </div>

                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cobalt-50 text-cobalt-700"
                    aria-hidden="true"
                  >
                    <Icon name="route" className="h-5 w-5" />
                  </span>
                </div>

                {itinerary.description ? (
                  <p className="clamp-2 mt-3 text-sm leading-6 text-neutral-600">
                    {itinerary.description}
                  </p>
                ) : (
                  <p className="mt-3 text-sm italic text-neutral-400">No description</p>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                  <ButtonLink to={`/itineraries/${itinerary.id}`} variant="primary" size="sm">
                    Open plan
                    <Icon name="arrow-right" className="h-3.5 w-3.5" />
                  </ButtonLink>
                  <Button variant="outline" size="sm" onClick={() => setEditing(itinerary)}>
                    <Icon name="pencil" className="h-3.5 w-3.5" />
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingDelete(itinerary)}
                    aria-label={`Delete ${itinerary.name}`}
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {createOpen ? <ItineraryFormDialog onClose={() => setCreateOpen(false)} /> : null}

      {editing ? (
        <ItineraryFormDialog onClose={() => setEditing(null)} itinerary={editing} />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        loading={deleteMutation.isPending}
        title="Delete this itinerary?"
        message={`“${pendingDelete?.name}” and all ${pendingDelete?.itemCount ?? 0} of its stops will be permanently deleted. The attractions themselves are not affected.`}
        confirmLabel="Delete itinerary"
      />
    </div>
  );
}

export default ItinerariesPage;
