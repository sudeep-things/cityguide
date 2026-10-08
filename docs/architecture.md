# Architecture

## Overview

CityGuide is three tiers with one optional external dependency:

```
Browser (React SPA)
        │  JSON over HTTPS, session cookie
        ▼
Express REST API
        │  parameterised SQL
        ▼
SQL database  ──►  Nominatim (only for curator-triggered address lookup)
```

Three principles hold the design together:

1. **The database is the source of truth.** React Query caches responses for
   speed, but no attraction, save or itinerary exists only in the browser. A
   refresh never loses anything.
2. **The backend is the only path to external services.** The browser never
   talks to Nominatim, so the required User-Agent, the request throttle and the
   cache cannot be bypassed.
3. **Authorization is server-side.** Route guards in React decide what to
   *render*; the API decides what is *allowed*. Hiding a button is never the
   control.

---

## Repository layout

```
cityguide/
├── backend/       Express API
├── frontend/      React SPA
├── database/      Migrations and seed data
├── docs/          This documentation
└── scripts/       Verification tooling
```

---

## Backend

### Layers

| Layer | Directory | Responsibility | Must not |
| --- | --- | --- | --- |
| Routes | `src/routes/` | Declare paths, attach guards and validators | Contain logic |
| Controllers | `src/controllers/` | Translate HTTP ↔ service calls, shape responses | Contain business rules |
| Services | `src/services/` | Business rules, transactions, ownership checks, audit | Touch `req` or `res` |
| Mappers | `src/services/mappers.js` | Database rows → API shapes | Leak column names |
| Database | `src/db/` | Driver selection, migrations, seeding | Know about HTTP |
| Validators | `src/validators/` | Zod schemas, one per resource | Query the database |
| Middleware | `src/middleware/` | Cross-cutting request concerns | Contain feature logic |

A controller is typically three lines: read from `req.valid`, call a service,
return an envelope. All the interesting decisions live in services, which are
plain functions taking a database handle — which is why they are easy to reason
about and to test.

### Middleware order

Order matters, and `src/app.js` documents why:

```
1.  helmet               security headers on every response, including errors
2.  requestLogger        assigns x-request-id so later failures are traceable
3.  cors                 credential-aware allow-list
4.  express.json         bounded at 256 kB, JSON only
5.  cookieParser         needed before the session can be read
6.  verifyRequestOrigin  blocks cross-site state-changing requests
7.  rate limiters        reject abusive traffic before any work happens
8.  attachSession        resolves the cookie into req.user
9.  routes
10. apiNotFoundHandler   404s for /api stay JSON, never the SPA shell
11. static + SPA fallback (production only)
12. errorHandler         the single exit point for every failure
```

### Request lifecycle

A `PATCH /api/itineraries/12/items/order` request:

1. `helmet` sets security headers.
2. `requestLogger` assigns a request id and opens a child logger.
3. CORS validates the origin if one is present.
4. `express.json` parses the body, rejecting anything over 256 kB.
5. `verifyRequestOrigin` rejects the request if a browser sent a foreign origin.
6. `apiLimiter` checks the per-IP budget.
7. `attachSession` hashes the session cookie and looks it up, populating
   `req.user` — or clearing a stale cookie if the session is gone.
8. The route's `requireAuth` guard runs, then `validate` parses the params and
   body into `req.valid`, rejecting unknown shapes with `422`.
9. The controller calls `reorderItineraryItems`.
10. The service verifies ownership, validates that the payload describes every
    stop exactly once, then runs the two-phase position update inside one
    transaction, writing an audit row in the same transaction.
11. The controller returns `{ success: true, data }`.
12. Any thrown `AppError` is converted to the standard envelope by
    `errorHandler`, logged at `warn` (expected) or `error` (unexpected), with
    stack traces kept server-side.

### Error handling

`AppError` carries a status, a stable machine-readable code, a user-safe message
and optional field details. Everything else becomes a generic `500` — driver
messages, SQL text and stack traces never reach a client. The development build
attaches a short stack to `500` responses to speed up debugging; production does
not.

### Logging and audit

Two separate concerns:

- **Logs** (`pino`) — operational. Every request, every error, redacting cookies,
  authorization headers and password fields.
- **Audit trail** (the `audit_logs` table) — business and security history. Who
  changed what, when. Written inside the same transaction as the change it
  describes, so the trail cannot disagree with the data.

Audit writes are best-effort: a failure is logged and swallowed rather than
failing the user's request.

### The database abstraction

`src/db/index.js` picks a driver once per process and exposes:

```js
db.all(sql, params)       // rows[]
db.one(sql, params)       // row | null
db.execute(sql, params)   // { changes, lastInsertId }
db.tx(async (t) => …)     // transactional handle
db.ilike(column)          // case-insensitive comparison fragment
```

Queries are written once with `?` placeholders. The PostgreSQL driver compiles
them to `$1…$n`; the SQLite driver passes them through. See
[database.md](database.md) for the type normalisation that makes both drivers
return identical row shapes.

Two concurrency notes:

- SQLite has a single writer, so `tx()` is serialised through a promise-chain
  mutex and transaction bodies must stay free of I/O awaits.
- PostgreSQL transactions take a dedicated pooled client and nest via
  savepoints.

---

## Frontend

### Layers

| Layer | Directory | Responsibility |
| --- | --- | --- |
| Pages | `src/pages/` | Compose components, own view state |
| Components | `src/components/` | Presentational and interactive building blocks |
| Layouts | `src/layouts/` | Page chrome: public, auth, dashboard |
| Context | `src/context/` | Session identity, toast notifications |
| Services | `src/services/` | The only place that knows API paths |
| Hooks | `src/hooks/` | Debouncing, titles, media queries |
| Styles | `src/styles/` | The entire design system |

### Data flow

TanStack Query owns all server state. The `api.js` client:

- sends `credentials: 'include'` so the session cookie travels;
- unwraps `{ success, data }` and throws a typed `ApiError` for
  `{ success: false, error }`;
- converts network failures into a friendly, non-technical message;
- exposes `fieldErrors` so forms can show per-field validation messages without
  knowing the error envelope's shape.

Query keys are centralised in `services/queryKeys.js` so a mutation invalidates
exactly the right caches.

### Authentication state

The session lives in an httpOnly cookie, so the browser cannot read it. The
source of truth is therefore the API: `GET /auth/me` is fetched once and cached,
and signing in or out updates that cache and drops every identity-scoped query
(`saved-places`, `itineraries`, `profile`, `admin`, `curator`) so the next user
of the browser never sees the previous one's data.

### Route guards

`RequireAuth` and `RequireRole` decide what to render and where to redirect.
They deliberately do **not** attempt to secure anything: every protected
endpoint re-checks the session and role, so navigating directly to a URL grants
nothing. Guards make the product feel coherent; the API makes it safe.

### Design system

`src/styles/index.css` holds the whole visual identity:

- a Tailwind `@theme` block defining the cobalt ramp plus black/white aliases;
- component classes (`.btn`, `.input`, `.card`, `.badge`, tables, skeletons)
  written with plain CSS custom properties rather than `@apply`, so the tokens
  remain the single source of truth;
- base rules for focus visibility and reduced-motion;
- Leaflet overrides so the map matches the rest of the interface.

Pages compose those classes with Tailwind utilities. No page defines its own
palette.

### Performance

- Route-level code splitting is unnecessary at this size, but Leaflet is split
  into its own chunk so the discovery pages do not pay for the map.
- Attraction imagery is lazy-loaded and reserves its space, so nothing shifts as
  photos arrive.
- Search input is debounced (350 ms) before it touches the URL or the network.
- React Query keeps previous pages visible while the next loads
  (`keepPreviousData`), avoiding layout collapse during navigation.
- Itinerary reordering updates optimistically and debounces persistence, so a
  burst of clicks produces one request instead of many.

---

## Security

| Concern | Mitigation |
| --- | --- |
| Password storage | scrypt, N=16384 r=8 p=1, unique 16-byte salt, constant-time comparison |
| Account enumeration | Identical response and comparable timing for unknown account and wrong password |
| Session theft from a database dump | Only the SHA-256 digest of the token is stored |
| Cookie theft by script | `httpOnly`; not readable from JavaScript |
| CSRF | `SameSite` cookie, JSON-only bodies, plus an Origin/Referer check on writes |
| SQL injection | Parameterised queries everywhere; sort keys come from a whitelist |
| XSS | React escapes by default; image URLs are restricted to http/https at validation |
| Privilege escalation | Role checks on every privileged route and in the service layer |
| Cross-user data access | Ownership asserted in services, not only in routes |
| Brute force | Tiered rate limiting, tightest on authentication |
| Secret exposure | No secret is ever bundled into the browser build |
| Information leakage | Generic client messages; details and stacks stay in server logs |
| Supabase anon-key misuse | RLS enabled with deny-by-default policies for API roles |

### Trust boundaries

- **The browser is untrusted.** Everything it sends is validated server-side.
- **The database is trusted** to enforce its own constraints — and does, which
  is why the unique and check constraints matter rather than being decorative.
- **Nominatim is untrusted input.** Responses are treated as data, bounded in
  size, normalised, and never rendered as HTML.

---

## Trade-offs

**One portable SQL layer rather than an ORM.** SQL stays visible and reviewable,
and the same code runs on SQLite and PostgreSQL. The cost is that migrations
exist twice and joins are written by hand.

**JavaScript with Zod rather than TypeScript.** Runtime validation is where the
security boundary actually is; TypeScript types disappear at compile time. This
keeps the build simple at the cost of compile-time type checking.

**Server-side sessions rather than JWTs.** Sessions can be revoked instantly —
sign-out, password change and account deletion all take effect on the next
request. A stateless JWT cannot be withdrawn before expiry.

**A single Express service rather than separate auth and content services.**
At this scale, splitting would add deployment and network complexity without
buying anything. The service boundaries inside the code are what would make a
future split straightforward.

**Explicit `403` for another user's itinerary.** Returning `404` would conceal
which ids exist, but leaves a legitimate user following a stale link at a
confusing dead end. The clearer error was chosen deliberately.
