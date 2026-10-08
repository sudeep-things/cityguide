/**
 * Create / edit an attraction.
 *
 * Shared by the curator and administrator dashboards.
 *
 * The address lookup is the only place in the application that reaches
 * Nominatim, and it is strictly user-triggered: nothing happens until a curator
 * presses the button. Coordinates are then stored locally, so viewing the
 * attraction later never calls the external service again.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { attractionService, categoryService, locationService } from '../../services/resources.js';
import { queryKeys } from '../../services/queryKeys.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useDocumentTitle } from '../../hooks/useApp.js';
import { LocationMap } from '../../components/map/LocationMap.jsx';
import {
  Alert,
  Button,
  ButtonLink,
  Icon,
  InlineError,
  SectionHeading,
  SelectField,
  Skeleton,
  SkeletonText,
  Spinner,
  TextAreaField,
  TextField,
} from '../../components/ui/index.js';

const EMPTY_FORM = {
  name: '',
  description: '',
  categoryId: '',
  address: '',
  latitude: '',
  longitude: '',
  imageUrl: '',
};

export function AttractionFormPage({ basePath = '/curator' }) {
  const { id } = useParams();
  const isEditing = Boolean(id);

  useDocumentTitle(isEditing ? 'Edit attraction' : 'New attraction');

  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [geocodeResult, setGeocodeResult] = useState(null);
  const [geocodeError, setGeocodeError] = useState(null);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => categoryService.list(),
    staleTime: 5 * 60_000,
  });

  const attractionQuery = useQuery({
    queryKey: queryKeys.attraction(id),
    queryFn: () => attractionService.get(id),
    enabled: isEditing,
    retry: false,
  });

  const categories = categoriesQuery.data?.items ?? [];
  const attraction = attractionQuery.data?.attraction ?? null;

  // Load the existing record into the form once it arrives.
  useEffect(() => {
    if (!attraction) return;
    setForm({
      name: attraction.name,
      description: attraction.description,
      categoryId: String(attraction.category.id),
      address: attraction.address,
      latitude: attraction.latitude === null ? '' : String(attraction.latitude),
      longitude: attraction.longitude === null ? '' : String(attraction.longitude),
      imageUrl: attraction.imageUrl ?? '',
    });
  }, [attraction]);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((current) => ({ ...current, [name]: undefined }));
    if (formError) setFormError(null);
  }

  /* --- Address lookup ---------------------------------------------------- */

  const geocodeMutation = useMutation({
    mutationFn: (address) => locationService.geocode(address),
    onSuccess: (data) => {
      setGeocodeError(null);
      setGeocodeResult(data.location);
      setForm((current) => ({
        ...current,
        latitude: String(data.location.latitude),
        longitude: String(data.location.longitude),
      }));
      setFieldErrors((current) => ({
        ...current,
        address: undefined,
        latitude: undefined,
        longitude: undefined,
      }));
      toast.success('Location found and coordinates filled in.');
    },
    onError: (error) => {
      setGeocodeResult(null);
      setGeocodeError(
        error?.code === 'GEOCODING_NO_RESULTS'
          ? 'No location matched that address. Try adding a city, district or postcode.'
          : (error?.message ?? 'Location lookup failed. Please verify the address.'),
      );
    },
  });

  function handleLookup() {
    const address = form.address.trim();
    if (address.length < 5) {
      setFieldErrors((current) => ({
        ...current,
        address: 'Enter a full address before looking it up.',
      }));
      return;
    }
    setGeocodeError(null);
    geocodeMutation.mutate(address);
  }

  /* --- Save -------------------------------------------------------------- */

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      isEditing ? attractionService.update(id, payload) : attractionService.create(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['attractions'] });
      queryClient.invalidateQueries({ queryKey: ['curator'] });
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.attraction(data.attraction.id) });

      toast.success(isEditing ? 'Attraction updated.' : 'Attraction created.');
      navigate(`${basePath}/attractions`);
    },
    onError: (error) => {
      const errors = error?.fieldErrors ?? {};
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) {
        setFormError(error?.message ?? 'We could not save that attraction.');
      } else {
        setFormError('Please correct the highlighted fields and try again.');
      }
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);

    // Client-side checks mirror the server rules for fast feedback.
    const errors = {};
    if (form.name.trim().length < 2) errors.name = 'Enter a name of at least 2 characters.';
    if (form.description.trim().length < 10) {
      errors.description = 'Descriptions must be at least 10 characters long.';
    }
    if (!form.categoryId) errors.categoryId = 'Choose a category.';
    if (form.address.trim().length < 5) errors.address = 'Enter an address of at least 5 characters.';

    const latitudeEmpty = form.latitude.trim() === '';
    const longitudeEmpty = form.longitude.trim() === '';
    if (latitudeEmpty !== longitudeEmpty) {
      errors.latitude = 'Provide both latitude and longitude, or leave both empty.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please correct the highlighted fields and try again.');
      return;
    }

    setFieldErrors({});
    saveMutation.mutate({
      name: form.name.trim(),
      description: form.description.trim(),
      categoryId: Number(form.categoryId),
      address: form.address.trim(),
      latitude: latitudeEmpty ? null : form.latitude.trim(),
      longitude: longitudeEmpty ? null : form.longitude.trim(),
      imageUrl: form.imageUrl.trim() === '' ? null : form.imageUrl.trim(),
    });
  }

  const previewCoordinates = useMemo(() => {
    const latitude = Number.parseFloat(form.latitude);
    const longitude = Number.parseFloat(form.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  }, [form.latitude, form.longitude]);

  if (isEditing && attractionQuery.isError) {
    const missing = attractionQuery.error?.status === 404;
    return (
      <div className="container-page py-16">
        <Alert variant="error" title={missing ? 'Attraction not found' : 'Unable to load attraction'}>
          {missing
            ? 'That attraction could not be found. It may have been deleted.'
            : (attractionQuery.error?.message ?? 'Please try again.')}
        </Alert>
        <div className="mt-6">
          <ButtonLink to={`${basePath}/attractions`} variant="primary">
            Back to attractions
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (isEditing && attractionQuery.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="card p-6">
          <SkeletonText lines={6} />
        </div>
      </div>
    );
  }

  const isSaving = saveMutation.isPending;

  return (
    <div>
      <Link
        to={`${basePath}/attractions`}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-cobalt-700"
      >
        <Icon name="chevron-left" className="h-4 w-4" />
        Back to attractions
      </Link>

      <SectionHeading
        title={isEditing ? `Edit “${attraction?.name}”` : 'Add a new attraction'}
        description={
          isEditing
            ? 'Update the details below. Changes are published immediately.'
            : 'Complete the details, look up the address to get coordinates, then publish.'
        }
      />

      <form onSubmit={handleSubmit} className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" noValidate>
        {/* Main fields --------------------------------------------------- */}
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-base font-bold text-black">Attraction details</h2>

            <div className="mt-5 space-y-5">
              <TextField
                label="Attraction name"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                error={fieldErrors.name}
                placeholder="Tower of London"
                maxLength={120}
                required
              />

              <TextAreaField
                label="Description"
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                error={fieldErrors.description}
                hint={`${form.description.length} / 4000 characters. At least 10 characters.`}
                placeholder="What makes this place worth visiting?"
                rows={6}
                maxLength={4000}
                required
              />

              <SelectField
                label="Category"
                value={form.categoryId}
                onChange={(event) => updateField('categoryId', event.target.value)}
                error={fieldErrors.categoryId}
                required
              >
                <option value="">
                  {categoriesQuery.isPending ? 'Loading categories…' : 'Choose a category'}
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </SelectField>

              <TextField
                label="Image URL (optional)"
                type="url"
                value={form.imageUrl}
                onChange={(event) => updateField('imageUrl', event.target.value)}
                error={fieldErrors.imageUrl}
                hint="Must start with http:// or https://"
                placeholder="https://example.org/photo.jpg"
              />
            </div>
          </div>

          {/* Location ---------------------------------------------------- */}
          <div className="card p-6">
            <h2 className="text-base font-bold text-black">Location</h2>
            <p className="mt-1.5 text-sm text-neutral-600">
              Enter the address, then look it up to fill in the coordinates. Coordinates are stored
              locally, so the map on the public page never queries an external service.
            </p>

            <div className="mt-5 space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <TextField
                  label="Address"
                  value={form.address}
                  onChange={(event) => updateField('address', event.target.value)}
                  error={fieldErrors.address}
                  placeholder="Great Russell Street, Bloomsbury, London WC1B 3DG"
                  containerClassName="flex-1"
                  maxLength={300}
                  required
                />
                <Button
                  variant="secondary"
                  onClick={handleLookup}
                  loading={geocodeMutation.isPending}
                  disabled={geocodeMutation.isPending}
                  className="sm:mb-0.5 sm:w-auto"
                >
                  {geocodeMutation.isPending ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Looking up…
                    </>
                  ) : (
                    <>
                      <Icon name="search" className="h-4 w-4" />
                      Look up location
                    </>
                  )}
                </Button>
              </div>

              {geocodeError ? (
                <Alert variant="error" title="Location lookup failed">
                  {geocodeError}
                </Alert>
              ) : null}

              {geocodeResult ? (
                <Alert variant="success" title="Location found">
                  <p>{geocodeResult.displayName}</p>
                  <p className="mt-1 font-mono text-xs text-neutral-600">
                    {geocodeResult.latitude}, {geocodeResult.longitude}
                    {geocodeResult.fromCache ? ' · served from cache' : ' · newly looked up'}
                  </p>
                  {geocodeResult.attribution ? (
                    <p className="mt-2 text-xs text-neutral-500">
                      Geocoding by{' '}
                      <a
                        href={geocodeResult.attribution.providerUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="link text-xs"
                      >
                        {geocodeResult.attribution.provider}
                      </a>{' '}
                      · {geocodeResult.attribution.text}
                    </p>
                  ) : null}
                </Alert>
              ) : null}

              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  label="Latitude"
                  value={form.latitude}
                  onChange={(event) => updateField('latitude', event.target.value)}
                  error={fieldErrors.latitude}
                  placeholder="51.508112"
                  inputMode="decimal"
                  hint="Between -90 and 90"
                />
                <TextField
                  label="Longitude"
                  value={form.longitude}
                  onChange={(event) => updateField('longitude', event.target.value)}
                  error={fieldErrors.longitude}
                  placeholder="-0.075949"
                  inputMode="decimal"
                  hint="Between -180 and 180"
                />
              </div>

              {previewCoordinates ? (
                <LocationMap
                  latitude={previewCoordinates.latitude}
                  longitude={previewCoordinates.longitude}
                  label={form.name || 'New attraction'}
                  address={form.address}
                  className="h-64 w-full"
                  interactive={false}
                />
              ) : null}
            </div>
          </div>
        </div>

        {/* Sidebar -------------------------------------------------------- */}
        <aside className="space-y-4">
          <div className="card sticky top-24 p-6">
            <h2 className="text-base font-bold text-black">
              {isEditing ? 'Save changes' : 'Publish attraction'}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-neutral-600">
              {isEditing
                ? 'Your changes take effect immediately on the public catalogue.'
                : 'Once published, this attraction appears in search, filters and the catalogue.'}
            </p>

            {formError ? (
              <Alert variant="error" className="mt-4">
                {formError}
              </Alert>
            ) : null}

            <div className="mt-5 flex flex-col gap-2">
              <Button type="submit" variant="primary" block loading={isSaving}>
                <Icon name={isEditing ? 'check' : 'plus'} className="h-4 w-4" />
                {isEditing ? 'Save changes' : 'Create attraction'}
              </Button>
              <ButtonLink to={`${basePath}/attractions`} variant="outline" block>
                Cancel
              </ButtonLink>
            </div>

            {isEditing && attraction ? (
              <div className="mt-5 border-t border-neutral-100 pt-4">
                <ButtonLink to={`/attractions/${attraction.id}`} variant="ghost" size="sm" block>
                  <Icon name="external-link" className="h-3.5 w-3.5" />
                  View public page
                </ButtonLink>
              </div>
            ) : null}
          </div>

          <Alert variant="info" title="About address lookup">
            Address lookups go through the CityGuide API to Nominatim, which asks that requests are
            made one at a time and only when a person asks for them. Results are cached for 30 days, so
            looking up the same address twice does not contact the service again.
          </Alert>
        </aside>
      </form>

      {saveMutation.isError && Object.keys(fieldErrors).length === 0 ? (
        <div className="mt-4">
          <InlineError>{saveMutation.error?.message}</InlineError>
        </div>
      ) : null}
    </div>
  );
}

export default AttractionFormPage;
