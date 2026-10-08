# CityGuide API reference

Base URL: `/api`

- Local development: `http://localhost:4000/api`
- Production: `https://<your-api-host>/api`

All requests and responses are JSON. Authentication uses an **httpOnly session
cookie**, so browser clients must send requests with credentials included
(`fetch(url, { credentials: 'include' })`).

---

## Response envelope

Every response uses one of two shapes.

**Success**

```json
{
  "success": true,
  "data": { }
}
```

**Failure**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted data is not valid.",
    "details": [
      { "field": "name", "message": "Names must be at least 2 characters long." }
    ],
    "requestId": "9f2c1ab34de5f607"
  }
}
```

`details` is present only when there is field-level information.
`requestId` matches the `x-request-id` response header and the corresponding
server log line — quote it when reporting a problem.

---

## Status codes

| Code | Meaning |
| --- | --- |
| `200` | Success |
| `201` | Resource created |
| `204` | Success, no content |
| `400` | Malformed request (for example, invalid JSON) |
| `401` | Not authenticated |
| `403` | Authenticated but not permitted |
| `404` | Resource not found |
| `409` | Conflict — duplicate record or a referential constraint |
| `413` | Payload too large (JSON bodies are capped at 256 kB) |
| `422` | Validation failed |
| `429` | Rate limited |
| `500` | Unexpected server error |
| `502` | An upstream service returned an unusable response |
| `503` | An upstream service is unavailable |
| `504` | An upstream service timed out |

---

## Error codes

| Code | Typical status | Meaning |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Malformed request body or parameters |
| `VALIDATION_ERROR` | 422 | One or more fields failed validation |
| `UNAUTHENTICATED` | 401 | No valid session |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `FORBIDDEN` | 403 | Insufficient role or not the owner |
| `NOT_FOUND` | 404 | No such resource |
| `CONFLICT` | 409 | Referential conflict (for example, a category still in use) |
| `DUPLICATE_RESOURCE` | 409 | Unique constraint violation |
| `PAYLOAD_TOO_LARGE` | 413 | Body exceeded the limit |
| `RATE_LIMITED` | 429 | Too many requests |
| `GEOCODING_NO_RESULTS` | 404 | The address could not be resolved |
| `GEOCODING_FAILED` | 502 | Geocoding failed for another reason |
| `UPSTREAM_ERROR` | 502 | Upstream returned an unusable response |
| `UPSTREAM_UNAVAILABLE` | 503 | Upstream unreachable, rate limited, or refused the client |
| `UPSTREAM_TIMEOUT` | 504 | Upstream exceeded `GEOCODE_TIMEOUT_MS` |
| `DATABASE_ERROR` | 500/503 | Database failure |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Health

### `GET /api/health`

No authentication. Used as a readiness probe.

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "sqlite",
    "environment": "development",
    "uptimeSeconds": 128,
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

---

## Authentication

### `POST /api/auth/register`

Creates a traveler account and starts a session. Rate limited.

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | 2–120 characters |
| `email` | string | Valid address, max 254 characters. Trimmed and lowercased. |
| `password` | string | 8–128 characters, at least one letter and one number |

```bash
curl -i -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"Passw0rd!"}'
```

`201 Created`:

```json
{ "success": true, "data": { "user": { "id": 5, "name": "Ada Lovelace", "email": "ada@example.com", "role": "traveler", "createdAt": "…", "updatedAt": "…" } } }
```

The session token is **never** in the body; it is set as an httpOnly cookie.

`409 DUPLICATE_RESOURCE` when the email is already registered.
`422 VALIDATION_ERROR` with per-field `details` otherwise.

### `POST /api/auth/login`

| Field | Type |
| --- | --- |
| `email` | string |
| `password` | string |

Returns `200` with the same body as registration. Returns `401
INVALID_CREDENTIALS` for both an unknown account and a wrong password — the two
cases are deliberately indistinguishable.

### `POST /api/auth/logout`

Deletes the session row and clears the cookie. Always returns `200`.

### `GET /api/auth/me`

Identity probe. Returns `200` even when signed out, so the frontend can check
session state at boot without generating spurious errors:

```json
{ "success": true, "data": { "authenticated": false, "user": null } }
```

When signed in, also includes `stats: { savedPlaces, itineraryCount, itineraryStops }`.

---

## Attractions

### `GET /api/attractions`

Public. Query parameters:

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `search` | string | — | Matches name, description, address and category name. `%` and `_` are treated literally. |
| `category` | string | — | Category **slug** (e.g. `museum`) |
| `categoryId` | integer | — | Category id; takes precedence over `category` |
| `sort` | enum | `newest` | `newest`, `oldest`, `name_asc`, `name_desc`, `category`, `recently_updated` |
| `page` | integer | `1` | |
| `limit` | integer | `12` | Max 100 |
| `mapped` | boolean | — | `true` returns only attractions that have coordinates |

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "name": "British Museum",
        "description": "The British Museum is a public museum dedicated to human history…",
        "address": "Great Russell Street, Bloomsbury, London WC1B 3DG",
        "latitude": 51.5194,
        "longitude": -0.1269,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/…",
        "category": { "id": 3, "name": "Museum", "slug": "museum" },
        "createdBy": { "id": 2, "name": "Priya Raman" },
        "createdAt": "2025-01-10T09:00:00.000Z",
        "updatedAt": "2025-01-10T09:00:00.000Z",
        "savedCount": 4,
        "isSaved": false
      }
    ],
    "pagination": {
      "page": 1, "limit": 12, "totalItems": 26, "totalPages": 3,
      "hasNextPage": true, "hasPreviousPage": false
    },
    "filters": { "search": null, "category": null, "categoryId": null, "sort": "newest", "mapped": false }
  }
}
```

`isSaved` reflects the **caller's** own shortlist and is always `false` for
anonymous requests.

### `GET /api/attractions/featured?limit=6`

Public. The most-saved attractions, falling back to the most recent.

### `GET /api/attractions/recent?limit=3`

Public. Newest additions.

### `GET /api/attractions/stats`

Requires the `curator` or `admin` role. Returns catalogue totals including
`unmappedAttractions`.

### `GET /api/attractions/:id`

Public. Returns `{ "attraction": { … } }`. `404 NOT_FOUND` when missing, or when
`:id` is not a positive integer (`422`).

### `POST /api/attractions`

Requires `curator` or `admin`.

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | 2–120 characters |
| `description` | string | yes | 10–4000 characters |
| `categoryId` | integer | yes | Must exist |
| `address` | string | yes | 5–300 characters |
| `latitude` | number \| string \| null | no | −90…90; rounded to 6 dp |
| `longitude` | number \| string \| null | no | −180…180; rounded to 6 dp |
| `imageUrl` | string \| null | no | Must be `http:` or `https:` |

Latitude and longitude must be supplied together or omitted together, otherwise
`422`.

### `PATCH /api/attractions/:id`

Requires `curator` or `admin`. Partial update — omitted fields are left
unchanged. An empty body is `422`. Coordinates follow the same pairing rule;
sending both as `null` clears them.

### `PUT /api/attractions/:id`

Full replacement. Optional fields absent from the body are cleared.

### `DELETE /api/attractions/:id`

Requires `curator` or `admin`. Saved places and itinerary stops that reference
the attraction are removed by `ON DELETE CASCADE`; the response reports the
impact:

```json
{ "success": true, "data": { "deleted": { "id": 12, "name": "…", "removedSavedPlaces": 3, "removedItineraryItems": 5 } } }
```

---

## Categories

| Method | Path | Access |
| --- | --- | --- |
| `GET` | `/api/categories` | Public |
| `GET` | `/api/categories/:id` | Public |
| `POST` | `/api/categories` | Curator |
| `PATCH` | `/api/categories/:id` | Curator |
| `PUT` | `/api/categories/:id` | Curator |
| `DELETE` | `/api/categories/:id` | Curator |

A category object includes `attractionCount`, computed from the database:

```json
{ "id": 3, "name": "Museum", "slug": "museum", "description": "…", "createdAt": "…", "attractionCount": 5 }
```

Create and update take `name` (2–80 characters) and an optional `description`
(max 500). The slug is derived from the name automatically.

`DELETE` returns `409 CONFLICT` when attractions still use the category:

```json
{ "success": false, "error": { "code": "CONFLICT", "message": "\"Museum\" is still used by 5 attractions. Reassign or delete them first." } }
```

---

## Saved places

All routes require authentication and act only on the caller's own shortlist.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/saved-places?page=&limit=` | The caller's shortlist, newest first |
| `POST` | `/api/saved-places` | Body `{ "attractionId": 1 }` |
| `DELETE` | `/api/saved-places/:id` | By saved-place id |
| `DELETE` | `/api/saved-places/attraction/:attractionId` | By attraction id (for toggles) |

```json
{ "success": true, "data": { "items": [ { "id": 7, "savedAt": "2025-01-15T10:00:00.000Z", "attraction": { … } } ], "pagination": { … } } }
```

Saving something already saved returns `409 DUPLICATE_RESOURCE`, guaranteed by
the `UNIQUE (user_id, attraction_id)` constraint. Unsaving something that is not
saved returns `404` rather than failing silently, so the client can reconcile.

---

## Itineraries

All routes require authentication. Every handler verifies that the caller owns
the itinerary (administrators may read any). A non-owner receives `403
FORBIDDEN` with the message *"That itinerary belongs to another traveler."*

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/itineraries` | The caller's itineraries, most recently updated first |
| `POST` | `/api/itineraries` | Body `{ name, description? }` |
| `GET` | `/api/itineraries/:id` | Itinerary **and** its ordered stops |
| `PATCH` | `/api/itineraries/:id` | Rename or change the description |
| `PUT` | `/api/itineraries/:id` | Full replacement |
| `DELETE` | `/api/itineraries/:id` | Delete, cascading to its stops |
| `GET` | `/api/itineraries/:id/items` | Ordered stops only |
| `POST` | `/api/itineraries/:id/items` | Add a stop |
| `PATCH` | `/api/itineraries/:id/items/order` | Apply a complete new order |
| `PUT` | `/api/itineraries/:id/items/order` | Alias for the above |
| `DELETE` | `/api/itineraries/:id/items/:itemId` | Remove a stop |

`GET /api/itineraries/:id` returns:

```json
{
  "success": true,
  "data": {
    "itinerary": { "id": 3, "name": "Classic London in a Day", "description": "…", "itemCount": 4, "createdAt": "…", "updatedAt": "…" },
    "items": [
      {
        "id": 21, "itineraryId": 3, "position": 0,
        "createdAt": "…", "updatedAt": "…",
        "attraction": { "id": 1, "name": "British Museum", "…": "…" }
      }
    ]
  }
}
```

### Adding a stop

`POST /api/itineraries/:id/items`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `attractionId` | integer | yes | Must exist |
| `position` | integer ≥ 0 | no | Insertion index; appended when omitted |

New stops are appended by default. Removing a stop re-packs the remaining
positions to `0…n-1`.

Errors: `404` unknown attraction or itinerary, `409 DUPLICATE_RESOURCE` when the
attraction is already in the itinerary.

### Reordering

`PATCH /api/itineraries/:id/items/order`

```json
{ "itemIds": [21, 24, 22, 23] }
```

The payload must list **every** stop in the itinerary exactly once, in the
desired order. Anything else is rejected with `422`:

- wrong number of ids → *"The new order must include every stop in this
  itinerary exactly once."*
- an id belonging to another itinerary → *"The new order references stops that
  are not in this itinerary."*
- duplicate ids → rejected by schema validation

Requiring the complete set makes the call idempotent and impossible to
half-apply. The whole reorder runs in one transaction:

```sql
-- 1. move every row out of the low band, so no intermediate state collides
UPDATE itinerary_items SET position = position + 1000000, updated_at = ? WHERE itinerary_id = ?;
-- 2. assign the final indices
UPDATE itinerary_items SET position = ?, updated_at = ? WHERE id = ? AND itinerary_id = ?;  -- 0
UPDATE itinerary_items SET position = ?, updated_at = ? WHERE id = ? AND itinerary_id = ?;  -- 1
-- …
```

This is what satisfies `UNIQUE (itinerary_id, position)` without ever violating
it, even transiently.

---

## Location

### `POST /api/location/geocode`

Requires `curator` or `admin`. Rate limited separately (default: 20 per minute).

```json
{ "address": "Tower Bridge, London" }
```

`200`:

```json
{
  "success": true,
  "data": {
    "location": {
      "latitude": 51.5055158,
      "longitude": -0.0753665,
      "displayName": "Tower Bridge, London, Greater London, England, United Kingdom",
      "provider": "nominatim",
      "cachedAt": "2025-01-15T10:32:00.000Z",
      "fromCache": false,
      "attribution": {
        "text": "© OpenStreetMap contributors",
        "url": "https://www.openstreetmap.org/copyright",
        "provider": "Nominatim (OpenStreetMap)",
        "providerUrl": "https://nominatim.org/"
      }
    },
    "attribution": { "…": "…" }
  }
}
```

`fromCache: true` means the result came from `geocode_cache` and Nominatim was not
contacted.

Errors:

| Status | Code | Cause |
| --- | --- | --- |
| `404` | `GEOCODING_NO_RESULTS` | No match. Message suggests adding a city or postcode. |
| `422` | `VALIDATION_ERROR` | Address shorter than 5 characters |
| `503` | `UPSTREAM_UNAVAILABLE` | Nominatim unreachable, rate limiting, or refusing this client's User-Agent |
| `504` | `UPSTREAM_TIMEOUT` | Exceeded `GEOCODE_TIMEOUT_MS` |
| `502` | `UPSTREAM_ERROR` | Unusable upstream response |

A `403` from Nominatim is reported as `503` with a message telling the operator
to configure `NOMINATIM_USER_AGENT`, because that is almost always the cause.

This is the **only** endpoint that contacts an external service, and it is
strictly user-triggered. Opening an attraction, listing the catalogue or
rendering a map never calls it.

### `GET /api/location/attribution`

Public. Returns the attribution string clients must display.

---

## Profile

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/users/profile` | Own account and statistics |
| `PATCH` | `/api/users/profile` | Update own `name` and/or `email` |
| `PUT` | `/api/users/profile` | Alias for the above |
| `POST` | `/api/users/profile/password` | Change own password |

```json
{
  "success": true,
  "data": {
    "user": { "id": 3, "name": "Sam Rivera", "email": "traveler@cityguide.test", "role": "traveler", "createdAt": "…", "updatedAt": "…" },
    "stats": { "savedPlaces": 4, "itineraryCount": 1, "itineraryStops": 4 }
  }
}
```

Changing a password requires `currentPassword` and `newPassword`, rejects reusing
the current password, and invalidates every **other** session for that account.

There is no route that exposes another user's private information.

---

## Curator

### `GET /api/curator/overview`

Requires `curator` or `admin`.

```json
{
  "success": true,
  "data": {
    "stats": { "totalAttractions": 26, "unmappedAttractions": 0, "totalCategories": 9, "createdLast30Days": 26 },
    "categories": [ { "id": 1, "name": "Historical", "attractionCount": 4, "…": "…" } ],
    "needsAttention": { "attractionsWithoutCoordinates": 0, "emptyCategories": 0 }
  }
}
```

---

## Administrator

Every route requires the `admin` role.

### `GET /api/admin/overview`

```json
{
  "success": true,
  "data": {
    "system": {
      "users": { "total": 4, "travelers": 2, "curators": 1, "admins": 1 },
      "attractions": 26, "categories": 9, "savedPlaces": 5,
      "itineraries": 2, "itineraryItems": 6,
      "eventsLast24Hours": 42, "activeSessions": 1
    },
    "catalogue": { "…": "…" },
    "recentActivity": [ { "id": 88, "action": "attraction.create", "entityType": "attraction", "actor": { "id": 2, "name": "Priya Raman" }, "createdAt": "…" } ]
  }
}
```

### `GET /api/admin/users`

Query: `search` (name or email), `role`, `page`, `limit` (max 100).

Each item includes `savedCount` and `itineraryCount` for oversight.

### `PATCH /api/admin/users/:id/role`

```json
{ "role": "curator" }
```

Valid roles: `traveler`, `curator`, `admin`.

Returns `409 CONFLICT` when demoting the **last remaining administrator**:

```json
{ "success": false, "error": { "code": "CONFLICT", "message": "This is the only administrator account. Promote another account before changing this role." } }
```

### `DELETE /api/admin/users/:id`

Deletes an account, cascading to its saved places, itineraries and stops.
Attractions the account created are kept, with `created_by` set to `NULL`.

Rejected with `422` when an administrator targets their own account through this
endpoint, and with `409` when it is the last administrator.

### `GET /api/admin/audit-logs`

Query: `action`, `entityType`, `userId`, `page`, `limit` (max 100).

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 88,
        "action": "attraction.update",
        "entityType": "attraction",
        "entityId": "12",
        "metadata": { "changed": { "name": "New name" } },
        "ipAddress": "127.0.0.1",
        "createdAt": "2025-01-15T10:35:00.000Z",
        "actor": { "id": 2, "name": "Priya Raman" }
      }
    ],
    "pagination": { "…": "…" }
  }
}
```

### `GET /api/admin/audit-logs/actions`

Returns `{ "actions": ["attraction.create", "auth.login", …] }` for filter menus.

### `GET /api/admin/catalogue-stats`

Catalogue totals plus `totalItineraries`.

---

## Recorded audit actions

| Action | Trigger |
| --- | --- |
| `auth.register` | Account created |
| `auth.login` | Successful sign-in |
| `auth.login_failed` | Wrong password or unknown account |
| `auth.logout` | Sign-out |
| `auth.password_changed` | Password changed |
| `attraction.create` / `.update` / `.delete` | Catalogue changes |
| `category.create` / `.update` / `.delete` | Category changes |
| `saved_place.create` / `.delete` | Shortlist changes |
| `itinerary.create` / `.update` / `.delete` | Itinerary changes |
| `itinerary_item.add` / `.remove` / `.reorder` | Stop changes |
| `user.role_change` | Role granted or revoked |
| `user.profile_update` | Own profile edited |
| `geocode.lookup` | Address lookup performed |

Passwords, password hashes, session tokens and cookie headers are redacted
before any log line is written.
