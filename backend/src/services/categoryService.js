/**
 * Category service.
 *
 * Categories are reference data. Anyone may read them; only curators and
 * administrators may change them, and the API enforces that before reaching
 * this layer.
 */
import { fromDatabaseError, conflict, duplicateResource, notFound } from '../utils/errors.js';
import { slugify } from '../utils/serialize.js';
import { mapCategory } from './mappers.js';
import { AuditActions, recordAudit } from './auditService.js';

/** Category rows joined with their attraction counts. */
const CATEGORY_SELECT = `
  SELECT c.id,
         c.name,
         c.slug,
         c.description,
         c.created_at,
         (SELECT COUNT(*) FROM attractions a WHERE a.category_id = c.id) AS attraction_count
    FROM categories c
`;

export async function listCategories(db) {
  const rows = await db.all(`${CATEGORY_SELECT} ORDER BY c.name ASC`);
  return rows.map(mapCategory);
}

export async function getCategoryById(db, id) {
  const row = await db.one(`${CATEGORY_SELECT} WHERE c.id = ?`, [id]);
  if (!row) throw notFound('That category could not be found.');
  return mapCategory(row);
}

export async function findCategoryById(db, id) {
  const row = await db.one(`${CATEGORY_SELECT} WHERE c.id = ?`, [id]);
  return mapCategory(row);
}

export async function findCategoryBySlug(db, slug) {
  const row = await db.one(`${CATEGORY_SELECT} WHERE c.slug = ?`, [slug]);
  return mapCategory(row);
}

/**
 * Resolves the `category` / `categoryId` query parameters used by the
 * attraction list endpoint. Accepts either a numeric id or a slug.
 */
export async function resolveCategoryFilter(db, { category, categoryId }) {
  if (categoryId) return findCategoryById(db, categoryId);
  if (!category) return null;

  if (/^\d+$/.test(category)) {
    const byId = await findCategoryById(db, Number(category));
    if (byId) return byId;
  }
  return findCategoryBySlug(db, category.toLowerCase());
}

function conflictFromError(error) {
  const message = String(error?.message ?? '');
  if (/categories/i.test(message) && /slug/i.test(message)) {
    return duplicateResource('A category with a similar name already exists.');
  }
  if (/categories/i.test(message) && /name/i.test(message)) {
    return duplicateResource('A category with that name already exists.');
  }
  return fromDatabaseError(error);
}

export async function createCategory(db, input, context = {}) {
  const { actor = null, ipAddress = null, logger } = context;
  const slug = slugify(input.name);

  if (!slug) throw conflict('That category name cannot be converted into a valid slug.');

  try {
    const created = await db.tx(async (tx) => {
      const row = await tx.one(
        `INSERT INTO categories (name, slug, description)
         VALUES (?, ?, ?)
         RETURNING id, name, slug, description, created_at`,
        [input.name, slug, input.description ?? null],
      );

      await recordAudit(tx, {
        userId: actor?.id ?? null,
        action: AuditActions.CATEGORY_CREATE,
        entityType: 'category',
        entityId: row.id,
        metadata: { name: row.name, slug: row.slug },
        ipAddress,
        logger,
      });

      return row;
    });

    logger?.info({ categoryId: created.id, actorId: actor?.id ?? null }, 'Category created');
    return { ...mapCategory(created), attractionCount: 0 };
  } catch (error) {
    if (error?.name === 'AppError') throw error;
    throw conflictFromError(error);
  }
}

export async function updateCategory(db, id, patch, context = {}) {
  const { actor = null, ipAddress = null, logger } = context;

  const existing = await db.one('SELECT id, name, slug, description FROM categories WHERE id = ?', [
    id,
  ]);
  if (!existing) throw notFound('That category could not be found.');

  const nextName = patch.name ?? existing.name;
  const nextSlug = patch.name ? slugify(patch.name) : existing.slug;
  if (!nextSlug) throw conflict('That category name cannot be converted into a valid slug.');

  const description =
    patch.description === undefined ? existing.description : patch.description;

  try {
    await db.tx(async (tx) => {
      await tx.execute(
        'UPDATE categories SET name = ?, slug = ?, description = ? WHERE id = ?',
        [nextName, nextSlug, description, id],
      );

      await recordAudit(tx, {
        userId: actor?.id ?? null,
        action: AuditActions.CATEGORY_UPDATE,
        entityType: 'category',
        entityId: id,
        metadata: {
          before: { name: existing.name, slug: existing.slug },
          after: { name: nextName, slug: nextSlug },
        },
        ipAddress,
        logger,
      });
    });
  } catch (error) {
    if (error?.name === 'AppError') throw error;
    throw conflictFromError(error);
  }

  logger?.info({ categoryId: id, actorId: actor?.id ?? null }, 'Category updated');
  return getCategoryById(db, id);
}

/**
 * Deletes a category. The `attractions.category_id` foreign key uses
 * ON DELETE RESTRICT, so a category that still classifies attractions cannot be
 * removed; this method turns that constraint into a helpful message.
 */
export async function deleteCategory(db, id, context = {}) {
  const { actor = null, ipAddress = null, logger } = context;

  const existing = await db.one('SELECT id, name, slug FROM categories WHERE id = ?', [id]);
  if (!existing) throw notFound('That category could not be found.');

  const usage = await db.one('SELECT COUNT(*) AS total FROM attractions WHERE category_id = ?', [
    id,
  ]);
  const inUse = Number(usage?.total ?? 0);
  if (inUse > 0) {
    throw conflict(
      `"${existing.name}" is still used by ${inUse} attraction${inUse === 1 ? '' : 's'}. Reassign or delete them first.`,
    );
  }

  await db.tx(async (tx) => {
    await tx.execute('DELETE FROM categories WHERE id = ?', [id]);
    await recordAudit(tx, {
      userId: actor?.id ?? null,
      action: AuditActions.CATEGORY_DELETE,
      entityType: 'category',
      entityId: id,
      metadata: { name: existing.name, slug: existing.slug },
      ipAddress,
      logger,
    });
  });

  logger?.info({ categoryId: id, actorId: actor?.id ?? null }, 'Category deleted');
  return { id: Number(id) };
}
