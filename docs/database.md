# Database

CityGuide stores everything in a relational database. The same logical schema is
expressed twice, once per supported dialect:

| Dialect | Migration | Used when |
| --- | --- | --- |
| SQLite | [`database/migrations/sqlite/001_init.sql`](../database/migrations/sqlite/001_init.sql) | `DATABASE_URL` is unset (the default) |
| PostgreSQL | [`database/migrations/postgres/001_init.sql`](../database/migrations/postgres/001_init.sql) | `DATABASE_URL` is set, including Supabase |

Only the type syntax and timestamp defaults differ. Every table, column,
constraint, relationship and index is identical.

---

## Entity relationships

```
                    ┌─────────────┐
                    │    users    │
                    └──────┬──────┘
        ┌──────────────────┼───────────────────┬──────────────┐
        │                  │                   │              │
        ▼                  ▼                   ▼              ▼
┌───────────────┐  ┌──────────────┐   ┌──────────────┐  ┌────────────┐
│ saved_places  │  │ itineraries  │   │ attractions  │  │ audit_logs │
└───────┬───────┘  └──────┬───────┘   │ (created_by) │  └────────────┘
        │                 │           └──────┬───────┘
        │                 ▼                  │
        │         ┌────────────────┐         │
        │         │itinerary_items │         │
        │         └───────┬────────┘         │
        │                 │                  │
        └─────────────────┴──────────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │ attractions │◄──── categories
                   └─────────────┘
```

Both `saved_places` and `itinerary_items` are junction tables: they reference a
user-owned record on one side and an attraction on the other.

---

## Tables

### `users`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | integer | Primary key |
| `name` | text | Not null |
| `email` | text | Not null, **unique**, stored lowercase |
| `password_hash` | text | Not null — scrypt digest, never plaintext |
| `role` | text | Not null, default `traveler`, `CHECK IN ('traveler','curator','admin')` |
| `created_at` | timestamp | Not null |
| `updated_at` | timestamp | Not null |

### `sessions`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | integer | Primary key |
| `token_hash` | text | Not null, **unique** — SHA-256 of the cookie value |
| `user_id` | integer | Not null, FK → `users(id)` `ON DELETE CASCADE` |
| `user_agent` | text | Nullable, truncated to 400 characters |
| `ip_address` | text | Nullable |
| `expires_at` | timestamp | Not null |
| `created_at` | timestamp | Not null |

The raw token exists only in the browser's httpOnly cookie. A database dump
therefore cannot be used to impersonate anyone.

### `categories`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | integer | Primary key |
| `name` | text | Not null, **unique** |
| `slug` | text | Not null, **unique** — derived from the name |
| `description` | text | Nullable |
| `created_at` | timestamp | Not null |

### `attractions`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | integer | Primary key |
| `name` | text | Not null |
| `description` | text | Not null |
| `category_id` | integer | Not null, FK → `categories(id)` **`ON DELETE RESTRICT`** |
| `address` | text | Not null |
| `latitude` | real / double precision | Nullable, `CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90)` |
| `longitude` | real / double precision | Nullable, `CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)` |
| `image_url` | text | Nullable |
| `created_by` | integer | Nullable, FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` | timestamp | Not null |
| `updated_at` | timestamp | Not null |

`NULL` coordinates mean "not geocoded yet". The check constraints make an
out-of-range coordinate impossible even if the API is bypassed.

### `saved_places`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | integer | Primary key |
| `user_id` | integer | Not null, FK → `users(id)` `ON DELETE CASCADE` |
| `attraction_id` | integer | Not null, FK → `attractions(id)` `ON DELETE CASCADE` |
| `created_at` | timestamp | Not null |

**`UNIQUE (user_id, attraction_id)`** — the business rule that makes saving
idempotent.

### `itineraries`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | integer | Primary key |
| `user_id` | integer | Not null, FK → `users(id)` `ON DELETE CASCADE` |
| `name` | text | Not null |
| `description` | text | Nullable |
| `created_at` | timestamp | Not null |
| `updated_at` | timestamp | Not null |

Privacy is expressed by `user_id` plus an ownership check in the service layer,
not by a database policy — so it applies identically on both dialects.

### `itinerary_items`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | integer | Primary key |
| `itinerary_id` | integer | Not null, FK → `itineraries(id)` `ON DELETE CASCADE` |
| `attraction_id` | integer | Not null, FK → `attractions(id)` `ON DELETE CASCADE` |
| `position` | integer | Not null, `CHECK (position >= 0)` |
| `created_at` | timestamp | Not null |
| `updated_at` | timestamp | Not null |

- **`UNIQUE (itinerary_id, attraction_id)`** — a stop cannot appear twice.
- **`UNIQUE (itinerary_id, position)`** — two stops cannot claim the same slot.

### `audit_logs`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | integer | Primary key |
| `user_id` | integer | Nullable, FK → `users(id)` `ON DELETE SET NULL` |
| `action` | text | Not null |
| `entity_type` | text | Not null |
| `entity_id` | text | Nullable |
| `metadata` | text (SQLite) / JSONB (Postgres) | Nullable |
| `ip_address` | text | Nullable |
| `created_at` | timestamp | Not null |

`user_id` is nullable and `SET NULL` on delete, so the trail survives account
deletion. `entity_id` is text so any identifier type can be recorded.

### `geocode_cache`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | integer | Primary key |
| `query_key` | text | Not null, **unique** — normalised lowercase address |
| `query` | text | Not null — the address as typed |
| `display_name` | text | Nullable |
| `latitude` | real / double precision | Nullable |
| `longitude` | real / double precision | Nullable |
| `payload` | text (SQLite) / JSONB (Postgres) | Nullable — selected upstream fields |
| `provider` | text | Not null, default `nominatim` |
| `created_at` | timestamp | Not null |

This table is what keeps the application inside Nominatim's
one-request-per-second policy: a repeat lookup is served here and never reaches
the network.

---

## Indexes

| Index | Columns | Supports |
| --- | --- | --- |
| `idx_sessions_user_id` | `sessions(user_id)` | Session cleanup per user |
| `idx_sessions_expires_at` | `sessions(expires_at)` | Expired-session sweeps |
| `idx_attractions_category` | `attractions(category_id)` | Category filtering |
| `idx_attractions_name` | `attractions(name)` | Name sorting and lookup |
| `idx_attractions_created_by` | `attractions(created_by)` | Authorship joins |
| `idx_saved_places_user` | `saved_places(user_id)` | A user's shortlist |
| `idx_saved_places_attraction` | `saved_places(attraction_id)` | Save counts per attraction |
| `idx_itineraries_user` | `itineraries(user_id)` | A user's itineraries |
| `idx_itinerary_items_order` | `itinerary_items(itinerary_id, position)` | Ordered retrieval — the hottest path |
| `idx_itinerary_items_attr` | `itinerary_items(attraction_id)` | Cascade deletes |
| `idx_audit_logs_created_at` | `audit_logs(created_at DESC)` | Recent activity feeds |
| `idx_audit_logs_user` | `audit_logs(user_id)` | Filter by actor |
| `idx_audit_logs_entity` | `audit_logs(entity_type, entity_id)` | Entity history |

---

## How ordering is persisted

`itinerary_items.position` holds a dense, zero-based index. The
`UNIQUE (itinerary_id, position)` constraint means a naive reorder would collide
mid-update, so the operation is performed in two phases inside one transaction:

```sql
-- Phase 1: shift every row in the itinerary into a high, empty band.
-- A constant offset keeps all values distinct, so no collision is possible.
UPDATE itinerary_items
   SET position = position + 1000000, updated_at = ?
 WHERE itinerary_id = ?;

-- Phase 2: assign the final indices in the requested order.
UPDATE itinerary_items SET position = 0, updated_at = ? WHERE id = ? AND itinerary_id = ?;
UPDATE itinerary_items SET position = 1, updated_at = ? WHERE id = ? AND itinerary_id = ?;
-- …
```

The offset (1,000,000) is far above the 200-item ceiling that validation
enforces, so the bands can never overlap. Both phases commit together or not at
all.

Removing a stop deletes the row and then re-packs the remaining positions to
`0…n-1`, so no gaps can accumulate. Adding at a specific index reuses the same
two-phase routine: the new row is inserted into the high band, and the complete
new order is applied in one pass.

---

## Migrations

Migrations are plain `.sql` files applied in filename order and recorded in a
`schema_migrations` table (`id`, `applied_at`). Every statement is idempotent
(`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), so running them is
safe at any time.

```bash
pnpm run migrate     # apply pending migrations
```

`backend/src/server.js` calls the same runner at boot, so a fresh deployment
creates its own schema with no manual step.

To start over:

```bash
pnpm run db:reset    # drops every table, then re-applies migrations (asks first)
pnpm run seed        # reloads categories, attractions, demo users and content
```

---

## The portable query layer

Services never write dialect-specific SQL. They talk to a small interface —
`all`, `one`, `execute`, `tx`, plus `ilike(column)` for case-insensitive
comparison — provided by `backend/src/db/index.js`.

Queries are written once using `?` placeholders. The PostgreSQL driver compiles
them to `$1…$n` before execution; the SQLite driver passes them through. Results
are normalised so both drivers return identical shapes:

- PostgreSQL `Date` values become ISO strings, matching SQLite's `TEXT`
  timestamps;
- PostgreSQL `int8` (returned as a string by the driver) is parsed to a number,
  so `COUNT(*)` works the same in both;
- JSON columns are stored as text in SQLite and JSONB in PostgreSQL; the
  `parseJson` helper accepts either.

This is why no service contains a branch on which database is active.

### Supabase hardening

The PostgreSQL migration enables Row Level Security on every table and installs
deny-by-default policies for Supabase's `anon` and `authenticated` API roles.
All access goes through the Express API over the direct connection, which owns
the tables and is unaffected by RLS. The effect is that the tables cannot be read
or written with a Supabase anon key, even if one leaks.

---

## Seeding

```bash
pnpm run seed
```

Idempotent — every write matches on a natural key (category name, user email,
attraction name), so running it repeatedly converges rather than duplicating.
It loads 9 categories, 26 attractions, 4 demo accounts and a small amount of
demo content.

The seeder refuses to create the well-known demo accounts when
`NODE_ENV=production` unless `ALLOW_PRODUCTION_SEED=true` is set explicitly.
