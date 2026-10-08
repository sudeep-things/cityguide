/**
 * Database seeder.
 *
 * Idempotent: running it repeatedly converges on the same catalogue rather than
 * creating duplicates. Every write is matched on a natural key (category name,
 * user email, attraction name).
 *
 * Sources of the attraction data are recorded in `database/seed/attractions.json`
 * and documented in the README. The application never calls an external API to
 * serve attractions — this database is the source of truth.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { config, paths } from '../config/env.js';
import { logger as rootLogger } from '../config/logger.js';
import { closeDb, getDb } from './index.js';
import { runMigrations } from './migrate.js';
import { hashPassword } from '../utils/password.js';
import { slugify } from '../utils/serialize.js';

function readSeedFile(name, logger) {
  const file = path.join(paths.seedDir, name);
  if (!fs.existsSync(file)) {
    logger.warn({ file }, 'Seed file is missing; skipping');
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

async function seedCategories(db, logger) {
  const payload = readSeedFile('categories.json', logger);
  if (!payload) return new Map();

  const idByName = new Map();

  await db.tx(async (tx) => {
    for (const category of payload) {
      const slug = slugify(category.name);
      const existing = await tx.one('SELECT id FROM categories WHERE name = ?', [category.name]);

      if (existing) {
        await tx.execute('UPDATE categories SET slug = ?, description = ? WHERE id = ?', [
          slug,
          category.description ?? null,
          existing.id,
        ]);
        idByName.set(category.name, Number(existing.id));
      } else {
        const created = await tx.one(
          `INSERT INTO categories (name, slug, description) VALUES (?, ?, ?) RETURNING id`,
          [category.name, slug, category.description ?? null],
        );
        idByName.set(category.name, Number(created.id));
      }
    }
  });

  logger.info({ count: idByName.size }, 'Categories seeded');
  return idByName;
}

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

async function seedUsers(db, logger) {
  const payload = readSeedFile('users.json', logger);
  if (!payload) return new Map();

  if (config.isProduction && !process.env.ALLOW_PRODUCTION_SEED) {
    throw new Error(
      'Refusing to create demo accounts while NODE_ENV=production. Set ALLOW_PRODUCTION_SEED=true only if you understand that these credentials are public.',
    );
  }

  const idByEmail = new Map();

  for (const user of payload.users) {
    const email = user.email.trim().toLowerCase();
    const existing = await db.one('SELECT id FROM users WHERE email = ?', [email]);

    if (existing) {
      idByEmail.set(email, Number(existing.id));
      continue;
    }

    const passwordHash = await hashPassword(user.demoPassword);
    const created = await db.one(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id`,
      [user.name, email, passwordHash, user.role],
    );

    idByEmail.set(email, Number(created.id));
  }

  logger.info({ count: idByEmail.size }, 'Users seeded');
  return idByEmail;
}

/* -------------------------------------------------------------------------- */
/* Attractions                                                                 */
/* -------------------------------------------------------------------------- */

async function seedAttractions(db, logger, { categoryIds, curatorId }) {
  const payload = readSeedFile('attractions.json', logger);
  if (!payload) return new Map();

  const idByName = new Map();

  await db.tx(async (tx) => {
    for (const attraction of payload.attractions) {
      const categoryId = categoryIds.get(attraction.category);
      if (!categoryId) {
        logger.warn(
          { attraction: attraction.name, category: attraction.category },
          'Skipping attraction: unknown category',
        );
        continue;
      }

      const existing = await tx.one('SELECT id, created_by FROM attractions WHERE name = ?', [
        attraction.name,
      ]);

      if (existing) {
        // Refresh the descriptive fields but never overwrite authorship that a
        // curator set deliberately.
        await tx.execute(
          `UPDATE attractions
              SET description = ?, category_id = ?, address = ?,
                  latitude = ?, longitude = ?, image_url = ?, updated_at = ?
            WHERE id = ?`,
          [
            attraction.description,
            categoryId,
            attraction.address,
            attraction.latitude,
            attraction.longitude,
            attraction.imageUrl,
            new Date().toISOString(),
            existing.id,
          ],
        );
        idByName.set(attraction.name, Number(existing.id));
      } else {
        const created = await tx.one(
          `INSERT INTO attractions
             (name, description, category_id, address, latitude, longitude, image_url, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
          [
            attraction.name,
            attraction.description,
            categoryId,
            attraction.address,
            attraction.latitude,
            attraction.longitude,
            attraction.imageUrl,
            curatorId,
          ],
        );
        idByName.set(attraction.name, Number(created.id));
      }
    }
  });

  logger.info({ count: idByName.size }, 'Attractions seeded');
  return idByName;
}

/* -------------------------------------------------------------------------- */
/* Demo content                                                                */
/* -------------------------------------------------------------------------- */

/** Saved places and itineraries that make the app demonstrable on first run. */
const DEMO_CONTENT = [
  {
    email: 'traveler@cityguide.test',
    savedAttractions: ['British Museum', 'Tower of London', 'Borough Market', 'London Eye'],
    itineraries: [
      {
        name: 'Classic London in a Day',
        description:
          'A first-timer route through Bloomsbury, the City and the South Bank, ending with a river view at sunset.',
        stops: ['British Museum', 'Borough Market', 'Tower of London', 'London Eye'],
      },
    ],
  },
  {
    email: 'traveler2@cityguide.test',
    savedAttractions: ['Hyde Park'],
    itineraries: [
      {
        name: 'Quiet Morning',
        description: 'A slow start with greenery, then a train out to the glasshouses at Kew.',
        stops: ['Hyde Park', 'Royal Botanic Gardens, Kew'],
      },
    ],
  },
];

async function seedDemoContent(db, logger, { userIdsByEmail, attractionIdsByName }) {
  let savedPlaces = 0;
  let itineraries = 0;
  let stops = 0;

  for (const demo of DEMO_CONTENT) {
    const userId = userIdsByEmail.get(demo.email);
    if (!userId) continue;

    // Only populate demo content while the account is still empty, so re-running
    // the seeder never fights changes a demonstrator has made by hand.
    const existingSaved = await db.one(
      'SELECT COUNT(*) AS total FROM saved_places WHERE user_id = ?',
      [userId],
    );
    const existingItineraries = await db.one(
      'SELECT COUNT(*) AS total FROM itineraries WHERE user_id = ?',
      [userId],
    );

    if (Number(existingSaved?.total ?? 0) === 0) {
      await db.tx(async (tx) => {
        for (const name of demo.savedAttractions) {
          const attractionId = attractionIdsByName.get(name);
          if (!attractionId) continue;

          await tx.execute(
            `INSERT INTO saved_places (user_id, attraction_id) VALUES (?, ?)
             ON CONFLICT (user_id, attraction_id) DO NOTHING`,
            [userId, attractionId],
          );
          savedPlaces += 1;
        }
      });
    }

    if (Number(existingItineraries?.total ?? 0) === 0) {
      for (const itinerary of demo.itineraries) {
        const stopsForThisItinerary = itinerary.stops
          .map((name) => attractionIdsByName.get(name))
          .filter(Boolean);

        await db.tx(async (tx) => {
          const created = await tx.one(
            `INSERT INTO itineraries (user_id, name, description) VALUES (?, ?, ?) RETURNING id`,
            [userId, itinerary.name, itinerary.description],
          );

          // Positions are written densely from zero, matching what the
          // reorder endpoint produces.
          for (let index = 0; index < stopsForThisItinerary.length; index += 1) {
            await tx.execute(
              `INSERT INTO itinerary_items (itinerary_id, attraction_id, position) VALUES (?, ?, ?)`,
              [created.id, stopsForThisItinerary[index], index],
            );
            stops += 1;
          }
        });

        itineraries += 1;
      }
    }
  }

  logger.info({ savedPlaces, itineraries, stops }, 'Demo content seeded');
  return { savedPlaces, itineraries, stops };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export async function seedDatabase({ db, logger = rootLogger } = {}) {
  const database = db ?? (await getDb());

  const migration = await runMigrations({ db: database, logger });

  const categoryIds = await seedCategories(database, logger);
  const userIdsByEmail = await seedUsers(database, logger);
  const curatorId = userIdsByEmail.get('curator@cityguide.test') ?? null;
  const attractionIdsByName = await seedAttractions(database, logger, {
    categoryIds,
    curatorId,
  });

  const demo = await seedDemoContent(database, logger, {
    userIdsByEmail,
    attractionIdsByName,
  });

  return {
    migrationsApplied: migration.applied,
    categories: categoryIds.size,
    users: userIdsByEmail.size,
    attractions: attractionIdsByName.size,
    demo,
  };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  seedDatabase()
    .then(async (summary) => {
      rootLogger.info(summary, 'Seeding complete');
      await closeDb();
      process.exit(0);
    })
    .catch(async (error) => {
      rootLogger.fatal({ err: error }, 'Seeding failed');
      await closeDb().catch(() => {});
      process.exit(1);
    });
}
