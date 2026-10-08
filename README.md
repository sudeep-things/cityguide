# CityGuide

**Attraction discovery and itinerary planning.**

CityGuide is a full-stack tourism planning application. Visitors browse a curated
catalogue of attractions, search and filter it, save the places they like, and
arrange them into ordered day-by-day itineraries that persist in a database.
Curators maintain the catalogue through a dedicated dashboard — including
address-to-coordinate lookup via OpenStreetMap's Nominatim service — and
administrators manage accounts, roles and the audit trail.

It is a working product rather than a prototype: a React frontend talking to a
real Express REST API, backed by a real SQL database with foreign keys, unique
constraints and indexes. Nothing is mocked, no state is kept only in the browser,
and every privileged action is authorized on the server.

---

## Table of contents

- [Live deployment](#live-deployment)
- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Screenshots](#screenshots)
- [Database](#database)
- [API](#api)
- [Authentication and authorization](#authentication-and-authorization)
- [External API policy](#external-api-policy)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Demo accounts and seed data](#demo-accounts-and-seed-data)
- [Verification](#verification)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Attribution](#attribution)
- [Design decisions and trade-offs](#design-decisions-and-trade-offs)

---

## Live deployment

| Component | Platform | URL |
| --- | --- | --- |
| Frontend | Vercel | _Set after deployment — see [Deployment](#deployment)_ |
| API | Render | _Set after deployment_ |
| Database | Supabase PostgreSQL | Configured via `DATABASE_URL` |

The application runs locally with **no external services at all** — it falls back
to a SQLite file database — so you can evaluate the whole product before
provisioning anything. Step-by-step deployment instructions, including the exact
environment variables and the cross-site cookie settings that are easy to get
wrong, are in [Deployment](#deployment) and [`docs/deployment.md`](docs/deployment.md).

---

## Features

### Discovery

- Landing page with hero search, featured attractions (ranked by how many
  travellers have saved them), popular categories and recently added places.
- Attraction catalogue with keyword search across name, description, address and
  category, category filtering, six sort orders and pagination.
- Filter state lives in the URL, so any filtered view is shareable and survives a
  refresh and the browser back button.
- Responsive grid and list layouts.

### Attraction detail

- Full description, category, address and coordinates.
- Interactive Leaflet map built from stored coordinates, with OpenStreetMap
  attribution.
- Save / unsave and add-to-itinerary actions.
- Related attractions from the same category.
- Graceful degradation: attractions without coordinates show an explanation
  instead of an empty map.

### Saved places

- One-click save toggle on every card and detail page.
- Dedicated shortlist page with pagination.
- Duplicate saves are impossible — enforced by `UNIQUE (user_id, attraction_id)`
  in the database, not merely by a check in the UI.

### Itineraries

- Create, rename and delete named itineraries.
- Add stops from an attraction page, the saved list, or a search dialog inside
  the builder itself.
- Reorder stops with move up/down buttons **or** drag and drop. Both persist the
  complete new order to the database.
- Insert a stop at a specific position; positions are re-packed to stay dense
  (0, 1, 2, …) after every change.
- Straight-line distance between consecutive stops, computed from stored
  coordinates with no external calls.
- Copy the plan to the clipboard as a numbered list.
- Itineraries are private: another traveller receives `403`, enforced in the
  service layer on every read and write.

### Curator dashboard

- Catalogue overview with totals and a "worth reviewing" panel that flags
  attractions with no coordinates and categories that classify nothing.
- Full attraction CRUD with validation at both ends.
- **Address lookup**: enter an address, press *Look up location*, and the API
  calls Nominatim and fills in latitude and longitude, with a live map preview.
- Category management, including a clear explanation when a category cannot be
  deleted because attractions still use it.
- Search and filter across the catalogue, with per-row edit and delete.

### Administrator dashboard

- System overview: account counts by role, catalogue size, saved places,
  itineraries, active sessions and 24-hour event count.
- User management with search, role filtering and pagination.
- Role changes with a confirmation step that explains what the new role grants.
- Account deletion, with cascading cleanup of that user's data.
- Audit log viewer with action and entity filters, expandable metadata and
  relative timestamps.

### Platform

- Authentication with scrypt password hashing, server-side sessions and
  httpOnly cookies.
- Role-based access control enforced on the backend for every privileged route.
- Request validation with Zod on every mutating endpoint.
- Structured JSON logging with request correlation ids and secret redaction.
- An append-only audit trail covering authentication, content changes, role
  changes and geocoding lookups.
- Consistent loading, empty, error and success states throughout, including
  skeleton loaders.
- Responsive from 320 px upwards, with a skip link, visible focus states,
  labelled controls, live regions and no reliance on colour alone.

---

## Technology stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 19 + Vite 7 | Fast dev server, small optimized builds, no framework overhead |
| Routing | React Router 7 | Client-side routing with nested layouts and guards |
| Data fetching | TanStack Query 5 | Caching, background refetch, optimistic updates, request de-duplication |
| Styling | Tailwind CSS 4 | Design tokens in one file; no unused CSS in the bundle |
| Maps | Leaflet + react-leaflet | Free and open, no API key, OpenStreetMap tiles |
| Backend | Node.js + Express 5 | Minimal, well-understood REST framework |
| Validation | Zod 4 | One schema definition shared conceptually by client and server |
| Logging | pino + pino-http | Structured JSON with redaction and per-request child loggers |
| Database | SQLite (built-in `node:sqlite`) **or** PostgreSQL / Supabase | Runs anywhere with zero setup, deploys to Supabase unchanged |
| Authentication | scrypt + server-side sessions | Memory-hard hashing from Node's standard library; no native build step |
| Geocoding | Nominatim / OpenStreetMap | The required external integration; proxied through the API |

---

## Architecture

```
        ┌──────────────────────────────────────────────┐
        │  Browser — React 19 SPA                      │
        │  routing · forms · optimistic UI · Leaflet   │
        └───────────────────┬──────────────────────────┘
                            │  fetch(credentials: 'include')
                            │  JSON  { success, data } | { success, error }
                            ▼
        ┌──────────────────────────────────────────────┐
        │  Express REST API                            │
        │                                              │
        │  helmet → logging → CORS → body parse →      │
        │  cookies → origin check → rate limit →       │
        │  session resolution → validation → routes    │
        │                                              │
        │  controllers → services → mappers            │
        │  authorization · audit · error envelope      │
        └───────┬──────────────────────────┬───────────┘
                │                          │
                ▼                          ▼
   ┌────────────────────────┐   ┌──────────────────────────┐
   │  SQL database          │   │  External services       │
   │                        │   │                          │
   │  SQLite (local)   or   │   │  Nominatim (geocoding)   │
   │  PostgreSQL/Supabase   │   │  throttled + cached      │
   │                        │   │                          │
   │  FKs · unique · checks │   │  OSM raster tiles        │
   └────────────────────────┘   └──────────────────────────┘
```

Three rules shape the design:

1. **The database is the source of truth.** Attractions, saves and itineraries
   live in SQL. The browser holds a query cache, never authoritative state.
2. **The backend is the only path to external services.** The browser never
   contacts Nominatim; it asks the API, which applies the User-Agent, the
   request throttle and the cache, then returns a normalized result.
3. **Authorization happens on the server.** Hiding a button is a usability
   decision; every protected endpoint independently verifies the session and
   the role.

More detail, including the middleware order and the service-layer boundaries, is
in [`docs/architecture.md`](docs/architecture.md).

---

## Screenshots

Captured from the running application by the browser verification suite
(`pnpm run verify:ui`):

| Screen | File |
| --- | --- |
| Landing page | `docs/screenshots/01-landing.png` |
| Attraction catalogue | `docs/screenshots/02-attractions.png` |
| Attraction detail with map | `docs/screenshots/03-attraction-detail.png` |
| Itinerary builder | `docs/screenshots/04-itinerary.png` |
| Curator dashboard | `docs/screenshots/05-curator.png` |
| Attraction editor with address lookup | `docs/screenshots/06-curator-form.png` |
| Admin overview | `docs/screenshots/07-admin.png` |
| Audit log | `docs/screenshots/08-audit-log.png` |
| Mobile layout | `docs/screenshots/09-mobile.png` |

---

## Database

Seven tables plus a geocoding cache. The same logical schema is expressed twice:
[`database/migrations/sqlite/001_init.sql`](database/migrations/sqlite/001_init.sql)
and
[`database/migrations/postgres/001_init.sql`](database/migrations/postgres/001_init.sql).
Only the type syntax and timestamp defaults differ.

```
users ──┬──< saved_places >──┐
        │                    │
        ├──< itineraries     │
        │        │           │
        │        └──< itinerary_items >──┤
        │                                │
        └──< audit_logs                  │
                                         ▼
categories ──< attractions >─────────────┘
                     ▲
                     │
              geocode_cache (standalone)
```

| Table | Purpose | Notable constraints |
| --- | --- | --- |
| `users` | Accounts | `UNIQUE (email)`; `role` restricted to traveler/curator/admin |
| `sessions` | Server-side sessions | `UNIQUE (token_hash)`; stores only the SHA-256 digest of the cookie value |
| `categories` | Attraction categories | `UNIQUE (name)`, `UNIQUE (slug)` |
| `attractions` | Catalogue | `FK category_id … ON DELETE RESTRICT`; `CHECK` on latitude/longitude ranges; `created_by … ON DELETE SET NULL` |
| `saved_places` | Traveler shortlists | **`UNIQUE (user_id, attraction_id)`** |
| `itineraries` | Private day plans | `FK user_id … ON DELETE CASCADE` |
| `itinerary_items` | Ordered stops | **`UNIQUE (itinerary_id, attraction_id)`** and **`UNIQUE (itinerary_id, position)`**; `CHECK (position >= 0)` |
| `audit_logs` | Append-only trail | `user_id … ON DELETE SET NULL` so the trail outlives deleted accounts |
| `geocode_cache` | Nominatim responses | `UNIQUE (query_key)` |

### Constraints that encode real business rules

- **`UNIQUE (user_id, attraction_id)` on `saved_places`** — a place cannot be
  bookmarked twice by the same account. The API also pre-checks so it can return
  a helpful `409`, but the database is what actually guarantees it under
  concurrency.
- **`UNIQUE (itinerary_id, position)` on `itinerary_items`** — two stops can
  never occupy the same slot in a plan. Reordering exploits this deliberately:
  see below.
- **`UNIQUE (itinerary_id, attraction_id)`** — the same stop cannot appear twice,
  which keeps reordering deterministic.
- **`ON DELETE RESTRICT` on `attractions.category_id`** — a category that still
  classifies attractions cannot be deleted, so the catalogue can never be left
  with orphaned rows.
- **`CHECK` bounds on coordinates** — an out-of-range latitude or longitude is
  rejected by the database, not only by the API.

### How ordering is persisted

`itinerary_items.position` is the order. To apply a new arrangement without ever
tripping `UNIQUE (itinerary_id, position)`, reordering runs inside one
transaction:

1. shift every row in the itinerary up by a large constant, clearing the
   low-numbered band entirely;
2. assign the final indices `0…n-1` in the requested order.

Because step 1 moves all rows together, no intermediate state collides. The
whole thing commits or rolls back as a unit. The API only accepts a payload
containing *every* stop exactly once, so a partial or stale reorder is rejected
rather than half-applied.

Indexes cover every foreign key and the columns used for filtering and sorting;
see the migration files for the full list.

---

## API

Base path `/api`. Successful responses are `{ "success": true, "data": … }`;
failures are `{ "success": false, "error": { code, message, details?, requestId } }`.

### Endpoints

```
GET    /api/health                       Service and database status

POST   /api/auth/register                Create a traveler account
POST   /api/auth/login                   Start a session
POST   /api/auth/logout                  End the session
GET    /api/auth/me                      Current identity and statistics

GET    /api/attractions                  Search, filter, sort, paginate
GET    /api/attractions/featured         Most-saved attractions
GET    /api/attractions/recent           Newest attractions
GET    /api/attractions/stats            Catalogue totals          (curator)
GET    /api/attractions/:id              Single attraction
POST   /api/attractions                  Create                    (curator)
PATCH  /api/attractions/:id              Partial update            (curator)
PUT    /api/attractions/:id              Full replace              (curator)
DELETE /api/attractions/:id              Delete                    (curator)

GET    /api/categories                   List with attraction counts
GET    /api/categories/:id               Single category
POST   /api/categories                   Create                    (curator)
PATCH  /api/categories/:id               Partial update            (curator)
PUT    /api/categories/:id               Full replace              (curator)
DELETE /api/categories/:id               Delete                    (curator)

GET    /api/saved-places                 The caller's shortlist     (auth)
POST   /api/saved-places                 Save an attraction         (auth)
DELETE /api/saved-places/:id             Remove by saved-place id   (auth)
DELETE /api/saved-places/attraction/:id  Remove by attraction id    (auth)

GET    /api/itineraries                  The caller's itineraries   (auth)
POST   /api/itineraries                  Create                     (auth)
GET    /api/itineraries/:id              Itinerary with ordered stops (owner or admin)
PATCH  /api/itineraries/:id              Partial update             (owner or admin)
PUT    /api/itineraries/:id              Full replace               (owner or admin)
DELETE /api/itineraries/:id              Delete                     (owner or admin)
GET    /api/itineraries/:id/items        Ordered stops              (owner or admin)
POST   /api/itineraries/:id/items        Add a stop                 (owner or admin)
PATCH  /api/itineraries/:id/items/order  Apply a complete new order (owner or admin)
PUT    /api/itineraries/:id/items/order  Alias for the above        (owner or admin)
DELETE /api/itineraries/:id/items/:itemId  Remove a stop            (owner or admin)

POST   /api/location/geocode             Address -> coordinates     (curator)
GET    /api/location/attribution         Required OSM attribution

GET    /api/users/profile                Own profile and statistics (auth)
PATCH  /api/users/profile                Update own name/email      (auth)
PUT    /api/users/profile                Alias for the above        (auth)
POST   /api/users/profile/password       Change own password        (auth)

GET    /api/curator/overview             Catalogue dashboard data   (curator)

GET    /api/admin/overview               System totals              (admin)
GET    /api/admin/users                  List, search, filter       (admin)
PATCH  /api/admin/users/:id/role         Change a role              (admin)
PUT    /api/admin/users/:id/role         Alias for the above        (admin)
DELETE /api/admin/users/:id              Delete an account          (admin)
GET    /api/admin/audit-logs             Filterable audit trail     (admin)
GET    /api/admin/audit-logs/actions     Distinct action names      (admin)
GET    /api/admin/catalogue-stats        Catalogue totals           (admin)
```

Status codes: `200` success, `201` created, `400` malformed request, `401`
unauthenticated, `403` unauthorized, `404` missing, `409` conflict (duplicate or
referential), `413` payload too large, `422` validation failure, `429` rate
limited, `500` server error, `502`/`503`/`504` upstream failure.

Full request and response documentation, with worked examples and the complete
error-code list, is in [`docs/api.md`](docs/api.md).

---

## Authentication and authorization

### How authentication works

1. Registration or sign-in verifies credentials and creates a row in `sessions`.
2. The browser receives a 256-bit random token in an **httpOnly** cookie. The
   database stores only the token's **SHA-256 digest**, so a database leak does
   not yield usable sessions.
3. Every request resolves that cookie to a user before any route handler runs.
4. Signing out deletes the session row and clears the cookie. Changing a password
   invalidates every other session for that account.

Passwords are hashed with **scrypt** (N=16384, r=8, p=1) using a fresh 16-byte
salt per account, and compared in constant time. A dummy hash is computed when
an email address is unknown, so response timing does not reveal which accounts
exist. Plaintext passwords are never stored, never logged, and never returned.

### Roles

| Capability | Traveler | Curator | Admin |
| --- | :---: | :---: | :---: |
| Browse, search and filter attractions | ✅ | ✅ | ✅ |
| View attraction details and maps | ✅ | ✅ | ✅ |
| Save and unsave attractions | ✅ | ✅ | ✅ |
| Create and manage own itineraries | ✅ | ✅ | ✅ |
| Create, edit and delete attractions | — | ✅ | ✅ |
| Look up addresses (geocoding) | — | ✅ | ✅ |
| Manage categories | — | ✅ | ✅ |
| Manage user roles | — | — | ✅ |
| View the audit trail | — | — | ✅ |
| Read any itinerary | — | — | ✅ |

Authorization is enforced by `requireAuth`, `requireRole` and per-service
ownership checks. A traveler who calls `POST /api/attractions` directly with a
valid session still receives `403`. An attempt to read another traveler's
itinerary returns `403` from the service layer, whatever route was used.

New accounts always start as `traveler`. Elevated roles are granted only through
the administrator role-management endpoint, and the last remaining administrator
cannot be demoted or deleted — the system cannot lock itself out.

---

## External API policy

### Nominatim / OpenStreetMap — geocoding

This is the application's only external integration. Nominatim is a donated
service with a
[strict usage policy](https://operations.osmfoundation.org/policies/nominatim/),
and the implementation is deliberately conservative:

| Requirement | How it is met |
| --- | --- |
| User-triggered only | A curator must press **Look up location**. Nothing runs on a timer or on page load. |
| No autocomplete | The endpoint takes one complete address and is called on submit only. |
| Descriptive User-Agent | Every outbound request sets `NOMINATIM_USER_AGENT`, or the optional `NOMINATIM_EMAIL` as the `email` parameter. |
| ≤ 1 request per second | Outbound calls pass through a serialising queue enforcing a minimum gap of `GEOCODE_MIN_INTERVAL_MS` (1100 ms). |
| Cache results | Successful lookups are stored in `geocode_cache` for 30 days. A repeated address never reaches the network. |
| Not a bulk POI backend | Attractions are seeded and curated in the local database. Nominatim is used only to resolve an address a human typed. |
| Attribution | Returned with every result and rendered in the footer, on the attraction detail map and beside the lookup field. |

The browser never contacts Nominatim. The flow is:

```
Curator types an address
        ↓
Frontend  →  POST /api/location/geocode        (session + curator role required)
        ↓
Backend   →  cache lookup (30-day TTL)
        ↓  miss
Backend   →  throttle queue → Nominatim /search
        ↓
Backend   →  normalise → store in geocode_cache → return
        ↓
Frontend  →  fills latitude/longitude, shows a map preview
        ↓
Saved attraction reads only the local database — no further external calls
```

A `403` from Nominatim is surfaced as an explicit configuration error rather
than a generic outage, because in practice it means the User-Agent was rejected.
The OSM Foundation rejects placeholder domains such as `example.com`, which is
why the built-in default carries no contact address and deployments are expected
to set a real one.

> **Before deploying publicly**, set `NOMINATIM_USER_AGENT` to identify your
> deployment with a real contact address or URL.

### Maps

Leaflet renders OpenStreetMap raster tiles directly in the browser, with the
required attribution control left visible and a second explicit credit beneath
the map. Markers are placed from coordinates already stored in the CityGuide
database, so opening a map never triggers a geocoding request.

### Other services

The brief lists several other public APIs (Open-Meteo, Open Library, TheMealDB,
Frankfurter, REST Countries, and so on). None are used. They were not needed for
the core discovery-and-planning workflow, and the brief explicitly asks not to
add unrelated integrations merely to demonstrate an API. The architecture leaves
room for them: any future integration belongs behind a service in
`backend/src/services/`, following the same pattern as `geocodeService.js` —
normalized responses, caching, timeouts, and never a key in the browser bundle.

---

## Getting started

### Prerequisites

- **Node.js 22.5 or newer** (the built-in `node:sqlite` module is used for the
  zero-configuration database). Node 24 LTS is recommended.
- **pnpm 9 or newer** (`npm install -g pnpm`). npm and Yarn also work if you
  prefer; the scripts are standard.
- No database server is required to run locally.

### Setup

```bash
# 1. Clone
git clone <your-repository-url> cityguide
cd cityguide

# 2. Install dependencies for both packages
pnpm install

# 3. Optional: create your environment file
#    Every value has a default, so this is only needed to override something.
cp .env.example .env

# 4. Create the schema and load the seed data
pnpm run migrate
pnpm run seed
```

### Run

```bash
# Both servers together
pnpm run dev
```

Or in two terminals:

```bash
pnpm run dev:backend    # http://localhost:4000
pnpm run dev:frontend   # http://localhost:5173
```

Open <http://localhost:5173>.

In development the frontend calls the API on a relative `/api` path and Vite
proxies it to Express, so there is no CORS configuration and no API URL to set.

### Other commands

```bash
pnpm run build       # Production build of the frontend
pnpm run start       # Start the API (serves the built frontend too, if present)
pnpm run db:reset    # Drop every table and re-run migrations (asks for confirmation)
pnpm run seed        # Re-run the seeder (idempotent)
pnpm run test        # End-to-end API verification against a running server
```

> `pnpm run start` serves the built SPA from the API when `frontend/dist` exists,
> which makes single-service deployment possible.

### Switching to PostgreSQL or Supabase

Set `DATABASE_URL` and the whole application moves to PostgreSQL, running the
PostgreSQL migrations instead:

```bash
# backend/.env — use Supabase's "Session pooler" string (see docs/deployment.md)
DATABASE_URL=postgresql://postgres.abcdefgh:PASSWORD@aws-0-eu-west-2.pooler.supabase.com:5432/postgres
```

Then `pnpm run migrate && pnpm run seed`. No code changes are required — the
service layer is written against a small portable interface and never branches on
dialect.

> **Do not use Supabase's *direct* connection string.** Newer projects make it
> IPv6-only, and hosts such as Render's free tier have no outbound IPv6, so it
> fails with `ENETUNREACH`. Use the **Session pooler** — port `5432` on the
> `pooler.supabase.com` host — not the transaction pooler on `6543`, whose
> transaction mode does not support the session-level transactions this app uses.

---

## Environment variables

Every variable is documented inline in [`.env.example`](.env.example). The ones
that most often need changing:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `DATABASE_URL` | _unset_ | Set it to use PostgreSQL/Supabase. Unset means SQLite. |
| `SQLITE_PATH` | `database/cityguide.db` | Local database file |
| `CORS_ORIGINS` | localhost origins | **Set to your deployed frontend origin in production** |
| `SESSION_COOKIE_SAMESITE` | `lax` | Use `none` when frontend and API are on different sites, together with `SESSION_COOKIE_SECURE=true` |
| `SESSION_COOKIE_SECURE` | `false` | **Must be `true` in production** (requires HTTPS) |
| `NOMINATIM_USER_AGENT` | generic | **Set a real contact before deploying publicly** |
| `TRUST_PROXY` | `false` | Set `true` behind one reverse proxy so `req.ip` is accurate |
| `VITE_API_URL` | _unset_ | Full API base URL including `/api`, for a separately hosted frontend |

No secret is ever shipped to the browser. The frontend bundle only contains
`VITE_API_URL`; the Supabase connection string, session settings and Nominatim
contact stay server-side.

---

## Demo accounts and seed data

`pnpm run seed` is idempotent and loads:

- **9 categories** — Historical, Nature, Museum, Religious, Adventure, Cultural,
  Entertainment, Shopping, Food.
- **26 real London attractions** with genuine coordinates, photography and
  descriptions, covering every category.
- **4 demo accounts**, one per role plus a second traveller used to demonstrate
  itinerary privacy.
- **Demo content** — saved places and two itineraries, so the interface is
  populated on first run.

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@cityguide.test` | `Admin123!` |
| Curator | `curator@cityguide.test` | `Curator123!` |
| Traveler | `traveler@cityguide.test` | `Traveler123!` |
| Traveler (second account) | `traveler2@cityguide.test` | `Traveler123!` |

> ⚠️ **These are public demo credentials.** They exist so the application can be
> evaluated immediately. The seeder refuses to create them when
> `NODE_ENV=production` unless `ALLOW_PRODUCTION_SEED=true` is set explicitly.
> Sign-in page includes one-click buttons for each demo role.

### Where the attraction data comes from

Coordinates, lead images and descriptions were resolved **once** from the
Wikipedia REST API by
[`backend/scripts/resolve-attraction-data.mjs`](backend/scripts/resolve-attraction-data.mjs)
and committed to [`database/seed/attractions.json`](database/seed/attractions.json).
The running application never calls Wikipedia, and the database is the source of
truth for every attraction it serves. Re-run that script only to refresh the
catalogue; it is a development tool, not part of the deployed system.

---

## Verification

Three layers of automated checks, plus a manual walkthrough.

### Unit tests — 36 checks

```bash
pnpm run test:unit
```

Covers the validation rules with no server or database required, concentrating on
the cases that are easy to get subtly wrong — in particular that an **absent**
field means "leave unchanged" while an explicit **null** means "clear it", which
is what stops a partial update from silently erasing coordinates.

### API acceptance suite — 179 checks

```bash
# Terminal 1
pnpm run dev:backend

# Terminal 2
pnpm run test
```

[`backend/tests/e2e.mjs`](backend/tests/e2e.mjs) drives the real API over HTTP
with a real cookie jar and asserts **179 checks**, including:

- the full traveler flow — register, sign in, search, filter, open an attraction,
  save three places, create an itinerary, add stops, reorder them, remove one,
  insert one at a position, sign out, sign back in and confirm everything is
  still stored;
- the curator flow — sign in, create an attraction, geocode a real address
  through Nominatim, confirm the coordinates are stored, edit it, and confirm the
  change is visible to anonymous readers;
- authorization — a traveler attempting every curator and administrator
  operation receives `403`, and the catalogue is unchanged afterwards;
- privacy — one traveler cannot read, list, rename, modify or delete another's
  itinerary (`403` at every entry point);
- data integrity — duplicate saves, duplicate stops, partial reorder payloads,
  out-of-range coordinates, one-sided coordinate updates and empty PATCH bodies
  are all rejected;
- hardening — SQL metacharacters in search, `%` treated literally rather than as
  a wildcard, malformed JSON, non-numeric ids, unknown routes, and confirmation
  that no stack trace or password material is ever returned or logged.

The geocoding assertions require outbound network access. If Nominatim is
unreachable the run reports that clearly and skips only the coordinate-specific
checks, so an upstream outage cannot mask an unrelated regression.

The suite talks HTTP and never inspects the driver, so these same 179 checks have
been run against **both** SQLite and a real PostgreSQL server — both pass. That
is what proves the portable data layer rather than merely asserting it: it
exercises the `?` → `$n` placeholder compilation, the `ON CONFLICT … DO UPDATE`
upsert, JSONB audit metadata, nested transaction savepoints, `ILIKE` search, and
the type normalisation that makes both drivers return identical row shapes.

### Browser suite — 81 checks

```bash
pnpm exec playwright install chromium   # or use an installed Chrome/Edge
pnpm run build && pnpm run start        # the API serves the built SPA
pnpm run verify:ui
```

Drives the real application in a real browser and asserts the full traveler,
curator and authorization flows — including reordering an itinerary stop and
reloading the page to prove the order came back from the database. It also fails
the run on any uncaught JavaScript error, unexpected console error or `5xx`
response, and writes the screenshots above.

### Manual walkthrough

See [`docs/verification.md`](docs/verification.md) for a click-by-click script
covering all three acceptance flows, the PostgreSQL schema and RLS checks, and
the accessibility checks that automation does not cover.

---

## Deployment

Free-tier deployment across three services. Full instructions, including the
cross-site cookie configuration that is the usual cause of "sign-in does nothing"
after deploying, are in [`docs/deployment.md`](docs/deployment.md).

### Summary

1. **Database and API host — Supabase + Render**

   Create a Supabase project, copy the connection string, and deploy the
   repository to Render as a web service:

   - Build: `pnpm install`
   - Start: `pnpm --filter cityguide-backend run start`
   - Health check: `/api/health`

   Required environment variables: `NODE_ENV=production`, `DATABASE_URL`,
   `CORS_ORIGINS=https://your-frontend.vercel.app`, `SESSION_COOKIE_SECURE=true`,
   `SESSION_COOKIE_SAMESITE=none`, `TRUST_PROXY=true`, `NOMINATIM_USER_AGENT`.

   Migrations run automatically at boot, so the schema is created on first start.

2. **Frontend — Vercel**

   Import the repository, set the root directory to `frontend`, and set
   `VITE_API_URL=https://your-api.onrender.com/api`.

3. **Verify**

   Open the frontend, sign in with a demo account, and confirm the browser
   stores the session cookie (`Secure`, `SameSite=None`) and that requests carry
   it.

`vercel.json` and `render.yaml` are included and pre-configured.

---

## Project structure

```
cityguide/
├── backend/
│   ├── scripts/
│   │   └── resolve-attraction-data.mjs   One-time seed-data generator
│   ├── src/
│   │   ├── config/       env.js · logger.js
│   │   ├── controllers/  HTTP layer: read validated input, call a service
│   │   ├── db/           Driver selection, migrations, seed, reset
│   │   ├── middleware/   auth · validate · error · rateLimit · security
│   │   ├── routes/       Route table with per-route guards
│   │   ├── services/     Business logic, transactions, audit, row mapping
│   │   ├── utils/        errors · password · tokens · cookies · http
│   │   ├── validators/   Zod schemas
│   │   ├── app.js        Express assembly and middleware order
│   │   └── server.js     Boot, migrate, listen, graceful shutdown
│   └── tests/e2e.mjs     End-to-end verification suite
│
├── frontend/
│   └── src/
│       ├── components/   ui kit · attraction cards · map · layout
│       ├── context/      AuthContext · ToastContext
│       ├── hooks/        useDebounce · useDocumentTitle · useMediaQuery
│       ├── layouts/      AppLayout · AuthLayout · DashboardLayout
│       ├── pages/        Public pages, curator/ and admin/ dashboards
│       ├── routes/       Route guards
│       ├── services/     api client · resource wrappers · query keys
│       ├── styles/       Design system (Tailwind theme + components)
│       ├── utils/        Formatting, distance, clipboard
│       ├── App.jsx       Routing table
│       └── main.jsx      Providers and entry point
│
├── database/
│   ├── migrations/sqlite/    001_init.sql
│   ├── migrations/postgres/  001_init.sql
│   └── seed/                 categories · users · attractions
│
├── docs/
│   ├── api.md            Full endpoint reference
│   ├── architecture.md   Layers, request lifecycle, decisions
│   ├── database.md       Schema, relationships, ordering algorithm
│   ├── deployment.md     Step-by-step deployment guide
│   ├── external-apis.md  External service usage and attribution
│   └── verification.md   Manual acceptance walkthrough
│
├── .env.example
├── .gitignore
├── .npmrc
├── package.json
├── pnpm-workspace.yaml
├── render.yaml
├── vercel.json
└── README.md
```

### Layer responsibilities

- **Routes** declare paths and attach guards. No logic.
- **Controllers** translate HTTP to a service call and shape the response. No
  business rules.
- **Services** own the rules: validation of cross-record invariants,
  transactions, ownership checks, audit writes. They never touch `req` or `res`.
- **Mappers** convert database rows to API shapes, so column names never leak
  into the public contract and password material cannot be exposed by accident.
- **Frontend services** are the only place that knows API paths.
- **Frontend pages** compose components and own view state; all shared styling
  lives in the design system.

---

## Attribution

| Source | Used for | Licence / terms |
| --- | --- | --- |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors | Map tiles | © OpenStreetMap contributors, ODbL |
| [Nominatim](https://nominatim.org/) | Address geocoding | Usage policy respected; see [External API policy](#external-api-policy) |
| [Wikipedia](https://www.wikipedia.org/) | Attraction descriptions | CC BY-SA 4.0 |
| [Wikimedia Commons](https://commons.wikimedia.org/) | Attraction photography | Various free licences |

Attribution is rendered in the site footer, beneath every map, and next to
geocoding results. It is a licence condition, not decoration.

---

## Design decisions and trade-offs

**One portable SQL layer instead of an ORM.** The service layer talks to a small
interface (`all`, `one`, `execute`, `tx`, plus an `ilike` helper). Queries are
written once with `?` placeholders and compiled to `$1…$n` for PostgreSQL. This
keeps SQL visible and reviewable, avoids an ORM's abstraction cost, and means the
same code runs on SQLite locally and Supabase in production. The trade-off is
that migrations exist twice — a small, explicit cost for a large portability win.

**scrypt rather than Argon2 or bcrypt.** Both alternatives need native
compilation, which fails on some hosts and adds a build step. scrypt is
memory-hard, is part of Node's standard library, and needs no toolchain. The
stored hash is self-describing (`scrypt$N$r$p$salt$key`), so cost parameters can
be raised later without invalidating existing passwords.

**Explicit 403 for private itineraries.** A non-owner receives `403` rather than
`404`. Returning `404` would conceal which itinerary ids exist, but it also
produces a confusing dead end for a legitimate user following a stale link. The
clearer error was chosen deliberately.

**JavaScript with Zod rather than TypeScript.** Zod validates at runtime, which
is where the security boundary actually is — TypeScript types vanish at compile
time and cannot protect an API. Runtime schema validation covers the same ground
for real inputs while keeping the build simple and the iteration fast.

**Server-side sessions rather than JWTs.** A session row can be revoked
instantly: signing out, changing a password, or deleting an account takes effect
on the next request. A stateless JWT cannot be withdrawn before it expires
without reintroducing server state anyway.

**Coordinates are looked up once and stored.** Geocoding happens when a curator
asks for it, and the result lives in the database. Every later view — catalogue,
detail page, map, distance calculation — reads only local data.

### Known limitations

- Itineraries are private only; there is no public sharing link.
- The Nominatim lookup resolves a single address to a single point. Multi-result
  disambiguation is left to the curator by refining the address.
- Distances between stops are straight-line estimates calculated from stored
  coordinates, not routed walking or transit directions.
- The API is rate limited per IP, which is coarse for users behind a shared
  proxy.
- There is no password-reset email flow, because that requires a mail provider
  and would add a credential the project does not need in order to demonstrate
  the core product.
