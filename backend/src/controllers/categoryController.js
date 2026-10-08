/**
 * Category endpoints. Public reads, curator-gated writes.
 */
import { getDb } from '../db/index.js';
import * as categoryService from '../services/categoryService.js';
import { sendCreated, sendOk } from '../utils/http.js';

function writeContext(req) {
  return {
    actor: req.user,
    ipAddress: req.ip ?? null,
    logger: req.log,
  };
}

export async function listCategories(req, res) {
  const db = await getDb();
  const categories = await categoryService.listCategories(db);
  return sendOk(res, { items: categories });
}

export async function getCategory(req, res) {
  const db = await getDb();
  const category = await categoryService.getCategoryById(db, req.valid.params.id);
  return sendOk(res, { category });
}

export async function createCategory(req, res) {
  const db = await getDb();
  const category = await categoryService.createCategory(
    db,
    req.valid.body,
    writeContext(req),
  );
  return sendCreated(res, { category });
}

export async function updateCategory(req, res) {
  const db = await getDb();
  const category = await categoryService.updateCategory(
    db,
    req.valid.params.id,
    req.valid.body,
    writeContext(req),
  );
  return sendOk(res, { category });
}

/** PUT — full replacement of the editable fields. */
export async function replaceCategory(req, res) {
  const db = await getDb();
  const { name, description } = req.valid.body;

  const category = await categoryService.updateCategory(
    db,
    req.valid.params.id,
    { name, description: description ?? null },
    writeContext(req),
  );

  return sendOk(res, { category });
}

export async function deleteCategory(req, res) {
  const db = await getDb();
  const result = await categoryService.deleteCategory(
    db,
    req.valid.params.id,
    writeContext(req),
  );
  return sendOk(res, { deleted: result });
}
