/**
 * Category management.
 *
 * Shared by the curator and administrator dashboards. The API refuses to delete
 * a category that still classifies attractions, and that refusal is surfaced
 * here as a clear message rather than a generic failure.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { categoryService } from '../../services/resources.js';
import { queryKeys } from '../../services/queryKeys.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useDocumentTitle } from '../../hooks/useApp.js';
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  Modal,
  SectionHeading,
  SkeletonRows,
  TableWrapper,
  TextAreaField,
  TextField,
} from '../../components/ui/index.js';
import { formatDate } from '../../utils/format.js';

/** Create / edit dialog. Mounted only while open so state starts clean. */
function CategoryDialog({ category = null, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEditing = Boolean(category);

  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [errors, setErrors] = useState({});

  const mutation = useMutation({
    mutationFn: (payload) =>
      isEditing ? categoryService.update(category.id, payload) : categoryService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      queryClient.invalidateQueries({ queryKey: ['curator'] });
      queryClient.invalidateQueries({ queryKey: ['attractions'] });
      toast.success(isEditing ? 'Category updated.' : 'Category created.');
      onClose();
    },
    onError: (error) => {
      const fieldErrors = error?.fieldErrors ?? {};
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) {
        toast.error(error?.message ?? 'We could not save that category.');
      }
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setErrors({ name: 'Category names must be at least 2 characters long.' });
      return;
    }
    setErrors({});
    mutation.mutate({
      name: trimmed,
      description: description.trim() === '' ? null : description.trim(),
    });
  }

  return (
    <Modal
      open
      onClose={mutation.isPending ? () => {} : onClose}
      title={isEditing ? 'Edit category' : 'New category'}
      description={
        isEditing
          ? 'Renaming a category updates its slug and every attraction that uses it keeps working.'
          : 'Categories group attractions and drive the filter on the attractions page.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={mutation.isPending}>
            {isEditing ? 'Save changes' : 'Create category'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <TextField
          label="Category name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          placeholder="Historical"
          maxLength={80}
          autoFocus
          required
        />

        <TextAreaField
          label="Description (optional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          placeholder="Castles, palaces, monuments and sites of historic interest."
          rows={3}
          maxLength={500}
        />
      </form>
    </Modal>
  );
}

export function CategoryManagementPage() {
  useDocumentTitle('Manage categories');

  const toast = useToast();
  const queryClient = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => categoryService.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => categoryService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      queryClient.invalidateQueries({ queryKey: ['curator'] });
      queryClient.invalidateQueries({ queryKey: ['attractions'] });
      toast.success('Category deleted.');
      setPendingDelete(null);
    },
    onError: (error) => {
      toast.error(error?.message ?? 'We could not delete that category.');
      setPendingDelete(null);
    },
  });

  const categories = categoriesQuery.data?.items ?? [];

  return (
    <div>
      <SectionHeading
        title="Categories"
        description="Categories are stored in the database and drive the public filter."
        action={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" className="h-4 w-4" />
            Add category
          </Button>
        }
      />

      <div className="card mt-6 overflow-hidden">
        {categoriesQuery.isPending ? (
          <div className="p-6">
            <SkeletonRows count={5} />
          </div>
        ) : categoriesQuery.isError ? (
          <div className="p-6">
            <ErrorState
              title="Unable to load categories"
              message={categoriesQuery.error?.message ?? 'Please try again.'}
              onRetry={() => categoriesQuery.refetch()}
            />
          </div>
        ) : categories.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon="layers"
              title="No categories available"
              description="Create a category before adding attractions."
              action={
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Icon name="plus" className="h-4 w-4" />
                  Add category
                </Button>
              }
            />
          </div>
        ) : (
          <TableWrapper>
            <table className="table">
              <caption className="sr-only">Attraction categories</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Slug</th>
                  <th scope="col">Attractions</th>
                  <th scope="col" className="hidden lg:table-cell">
                    Created
                  </th>
                  <th scope="col" className="text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <span className="block text-sm font-semibold text-black">{category.name}</span>
                      {category.description ? (
                        <span className="mt-0.5 block max-w-md truncate text-xs text-neutral-500">
                          {category.description}
                        </span>
                      ) : null}
                    </td>

                    <td>
                      <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">
                        {category.slug}
                      </code>
                    </td>

                    <td>
                      {category.attractionCount > 0 ? (
                        <Link
                          to={`/attractions?category=${encodeURIComponent(category.slug)}`}
                          className="link text-sm"
                        >
                          {category.attractionCount} attraction
                          {category.attractionCount === 1 ? '' : 's'}
                        </Link>
                      ) : (
                        <span className="text-sm text-neutral-400">None</span>
                      )}
                    </td>

                    <td className="hidden whitespace-nowrap text-sm text-neutral-600 lg:table-cell">
                      {formatDate(category.createdAt)}
                    </td>

                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(category)}
                          aria-label={`Edit ${category.name}`}
                        >
                          <Icon name="pencil" className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(category)}
                          aria-label={`Delete ${category.name}`}
                          disabled={category.attractionCount > 0}
                          title={
                            category.attractionCount > 0
                              ? 'Reassign or delete the attractions in this category first'
                              : undefined
                          }
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </div>

      <Alert variant="info" className="mt-6">
        A category that still classifies attractions cannot be deleted — the database enforces this with
        a restricting foreign key, and the API reports it as a conflict.
      </Alert>

      {creating ? <CategoryDialog onClose={() => setCreating(false)} /> : null}
      {editing ? <CategoryDialog category={editing} onClose={() => setEditing(null)} /> : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        loading={deleteMutation.isPending}
        title="Delete this category?"
        message={`“${pendingDelete?.name}” will be removed. This is only possible because no attractions currently use it.`}
        confirmLabel="Delete category"
      />
    </div>
  );
}

export default CategoryManagementPage;
