-- ============================================================================
-- CityGuide — SQLite schema (migration 001)
-- ----------------------------------------------------------------------------
-- This migration is the source of truth for the SQLite driver, which powers
-- zero-config local development. The PostgreSQL/Supabase schema in
-- ../postgres/001_init.sql is logically identical: same tables, columns,
-- relationships, unique constraints and indexes. Only the type syntax and the
-- timestamp defaults differ between the two files.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- users — travelers, curators and administrators
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  -- scrypt digest only; plaintext passwords are never stored or logged.
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'traveler'
                        CHECK (role IN ('traveler', 'curator', 'admin')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT users_email_unique UNIQUE (email)
);

-- ---------------------------------------------------------------------------
-- sessions — server-side session records. The cookie carries a random token;
-- only its SHA-256 hash is stored, so a database leak cannot be replayed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT    NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_agent  TEXT,
  ip_address  TEXT,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash)
);

-- ---------------------------------------------------------------------------
-- categories — reference data managed by curators and administrators
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  slug        TEXT    NOT NULL,
  description TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT categories_name_unique UNIQUE (name),
  CONSTRAINT categories_slug_unique UNIQUE (slug)
);

-- ---------------------------------------------------------------------------
-- attractions — the core catalogue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attractions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL,
  -- RESTRICT: a category that still classifies attractions cannot be deleted.
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  address     TEXT    NOT NULL,
  -- NULL means "not geocoded yet"; when present the value must be a real
  -- coordinate. Both ranges are enforced by the database, not just the API.
  latitude    REAL    CHECK (latitude  IS NULL OR (latitude  BETWEEN -90  AND 90)),
  longitude   REAL    CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  image_url   TEXT,
  -- SET NULL: removing a curator must not delete the places they contributed.
  created_by  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- saved_places — a traveler's shortlist.
-- UNIQUE (user_id, attraction_id) is the business rule that makes saving
-- idempotent: the same place cannot be bookmarked twice by the same account.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_places (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  attraction_id INTEGER NOT NULL REFERENCES attractions (id) ON DELETE CASCADE,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT saved_places_user_attraction_unique UNIQUE (user_id, attraction_id)
);

-- ---------------------------------------------------------------------------
-- itineraries — private day plans owned by a single traveler
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itineraries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- itinerary_items — ordered stops inside an itinerary.
--   * UNIQUE (itinerary_id, attraction_id): the same stop cannot appear twice
--     in one plan, which keeps reordering deterministic.
--   * UNIQUE (itinerary_id, position): no two stops may claim the same slot.
--     Reordering shifts every row by a temporary offset inside one transaction
--     so this constraint is never transiently violated.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itinerary_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  itinerary_id  INTEGER NOT NULL REFERENCES itineraries (id) ON DELETE CASCADE,
  attraction_id INTEGER NOT NULL REFERENCES attractions (id) ON DELETE CASCADE,
  position      INTEGER NOT NULL CHECK (position >= 0),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT itinerary_items_itinerary_attraction_unique UNIQUE (itinerary_id, attraction_id),
  CONSTRAINT itinerary_items_itinerary_position_unique   UNIQUE (itinerary_id, position)
);

-- ---------------------------------------------------------------------------
-- audit_logs — append-only trail of security-relevant and content actions.
-- user_id is nullable + SET NULL so the trail survives account deletion.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users (id) ON DELETE SET NULL,
  action      TEXT    NOT NULL,
  entity_type TEXT    NOT NULL,
  entity_id   TEXT,
  metadata    TEXT,
  ip_address  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- geocode_cache — locally persisted Nominatim responses. Serving a repeat
-- lookup from this table is what keeps the app inside Nominatim's
-- one-request-per-second usage policy.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geocode_cache (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  query_key    TEXT    NOT NULL,
  query        TEXT    NOT NULL,
  display_name TEXT,
  latitude     REAL,
  longitude    REAL,
  payload      TEXT,
  provider     TEXT    NOT NULL DEFAULT 'nominatim',
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT geocode_cache_query_key_unique UNIQUE (query_key)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessions_user_id        ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at     ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_attractions_category    ON attractions (category_id);
CREATE INDEX IF NOT EXISTS idx_attractions_name        ON attractions (name);
CREATE INDEX IF NOT EXISTS idx_attractions_created_by  ON attractions (created_by);
CREATE INDEX IF NOT EXISTS idx_saved_places_user       ON saved_places (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_places_attraction ON saved_places (attraction_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_user        ON itineraries (user_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_items_order   ON itinerary_items (itinerary_id, position);
CREATE INDEX IF NOT EXISTS idx_itinerary_items_attr    ON itinerary_items (attraction_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at   ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user         ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity       ON audit_logs (entity_type, entity_id);
