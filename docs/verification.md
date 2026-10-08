# Verification

Two layers of verification: an automated suite that drives the real API and a
real browser, and a manual walkthrough that covers the three acceptance flows
from the brief.

---

## Automated verification

Three layers: fast unit tests, an API acceptance suite, and a browser suite.

### Unit tests — 36 checks

```bash
pnpm run test:unit
```

[`backend/tests/unit/validators.test.mjs`](../backend/tests/unit/validators.test.mjs)
covers the validation rules with no server or database needed. It concentrates on
the cases that are easy to get subtly wrong:

- an **absent** optional field stays `undefined` ("leave unchanged") while an
  explicit **null** becomes `null` ("clear this value") — the distinction that
  stops a partial update from silently erasing coordinates;
- coordinates must be supplied as a pair, and neither can be updated alone;
- out-of-range and non-numeric coordinates are refused;
- `javascript:` and `data:` image URLs are refused while `https:` is accepted;
- unknown fields are stripped, so a client cannot smuggle in `role` or
  `createdBy`;
- a non-whitelisted sort key is rejected — the guard that keeps client input out
  of `ORDER BY`;
- password rules are enforced at registration but deliberately not at sign-in.

### API suite — 179 checks

```bash
# Terminal 1
pnpm run dev:backend

# Terminal 2
pnpm run test
```

[`backend/tests/e2e.mjs`](../backend/tests/e2e.mjs) drives the API over real HTTP
with a real cookie jar. Nothing is mocked: every assertion reflects what the API
actually persisted.

What it covers:

| Area | Examples |
| --- | --- |
| Discovery | Pagination, keyword search across all fields, category filtering, sort orders, empty results, 404s |
| Traveler flow | Register → sign in → save three places → create an itinerary → add stops → reorder → remove → insert at a position → sign out → sign back in → confirm everything survived |
| Curator flow | Sign in → create an attraction → geocode a real address through Nominatim → confirm coordinates stored → edit → confirm public visibility |
| Authorization | A traveler receives `403` for every curator and administrator operation, and the catalogue is unchanged afterwards |
| Privacy | One traveler cannot read, list, rename, add to, or delete another's itinerary — `403` at every entry point |
| Data integrity | Duplicate saves, duplicate stops, partial reorder payloads, out-of-range coordinates, one-sided coordinate updates, empty PATCH bodies |
| Hardening | SQL metacharacters in search, `%` treated literally, malformed JSON, non-numeric ids, unknown routes, no stack traces or password material in any response |
| Audit | Every documented action is recorded; no password material is logged |

The geocoding assertions need outbound network access. If Nominatim is
unreachable, the run says so and skips only the coordinate-specific checks, so an
upstream outage cannot mask an unrelated regression.

### Database dialect parity

The suite is **dialect-agnostic**: it talks HTTP and never inspects the database
driver, so the same 179 checks can be pointed at either backend.

```bash
# SQLite (default)
pnpm run dev:backend                                  # port 4000
pnpm --filter cityguide-backend run test              # http://127.0.0.1:4000

# PostgreSQL
DATABASE_URL="postgresql://…" PORT=4001 pnpm --filter cityguide-backend run start
pnpm --filter cityguide-backend exec node tests/e2e.mjs http://127.0.0.1:4001
```

Both have been run and both pass all 179 checks. Running the suite against real
PostgreSQL is what proves the portable data layer rather than merely asserting
it: it exercises the `?` → `$n` placeholder compilation, the `ON CONFLICT …
DO UPDATE` upsert used by the geocoding cache, JSONB audit metadata, nested
transaction savepoints, `ILIKE` search, and the timestamp/`int8` type
normalisation that makes the two drivers return identical row shapes.

It also exercises the hardest PostgreSQL-specific path directly: reordering an
itinerary shifts every row inside one transaction to satisfy
`UNIQUE (itinerary_id, position)`, and the check constraint on `position` is
enforced throughout.

#### Schema objects verified on PostgreSQL

Inspected with `information_schema` and `pg_constraint` rather than assumed:

| Object | Count | Verified |
| --- | --- | --- |
| Tables | 10 | Includes `schema_migrations` |
| CHECK constraints | 4 | Latitude/longitude ranges, `position >= 0`, role enum |
| UNIQUE constraints | 8 | Including `saved_places(user_id, attraction_id)` and `itinerary_items(itinerary_id, position)` |
| FOREIGN KEYs | 9 | Correct `ON DELETE CASCADE` / `RESTRICT` / `SET NULL` per relationship |
| Indexes | 13 | All `idx_*` present |
| Column types | — | `double precision`, `timestamptz`, `jsonb` as intended |

Constraint enforcement was tested by attempting violations and confirming the
database refused them:

| Attempted violation | Result |
| --- | --- |
| Save the same attraction twice | `23505` on `saved_places_user_attraction_unique` |
| Insert a latitude of 200 | `23514` on `attractions_latitude_check` |
| Delete a category still in use | `23001` on `attractions_category_id_fkey` |

#### Row Level Security verified

The migration enables RLS on all ten tables. On Supabase, where the `anon` and
`authenticated` roles exist, it also installs a deny-all policy for each — 20
policies in total.

Tested by granting `anon` **full table privileges** and then reading as that role
(`SET LOCAL ROLE anon`), so that RLS — not a missing grant — is what has to do
the work:

| Table | Rows the API role sees | Rows `anon` sees |
| --- | --- | --- |
| `users` | 4 | **0** |
| `attractions` | 26 | **0** |
| `saved_places` | 5 | **0** |
| `itineraries` | 2 | **0** |
| `schema_migrations` | 1 | **0** |

The API's own role continues to read all 26 attractions. A leaked Supabase anon
key therefore exposes nothing.

### Browser suite — 81 checks

```bash
pnpm exec playwright install chromium   # once; or set channel to an installed Chrome
pnpm run build                          # the API serves the built SPA
pnpm run start                          # http://localhost:4000
pnpm run verify:ui                      # in another terminal
```

[`scripts/verify-ui.mjs`](../scripts/verify-ui.mjs) drives the real application in
Chrome and asserts:

- every page renders with data fetched from the API;
- attraction photography actually decodes (not merely requested);
- search and filtering update the URL and the results;
- the Leaflet map renders tiles with visible attribution;
- the session cookie is set, is `httpOnly`, and survives a reload;
- saving toggles correctly and the shortlist grows by exactly one;
- **reordering a stop, then reloading the page, shows the new order** — the
  end-to-end proof that ordering is persisted rather than held in the browser;
- position numbers stay dense after a reorder;
- a traveler is refused the curator and administrator dashboards;
- the curator can geocode an address and publish an attraction that then appears
  in public search;
- an edit persists for anonymous readers;
- the administrator sees user totals, can filter users, and the audit log records
  attraction creation, sign-ins and geocoding;
- no horizontal overflow on mobile or tablet viewports, and the mobile menu opens;
- a missing attraction and an unknown route show friendly messages rather than
  crashing;
- **zero uncaught JavaScript errors, zero unexpected console errors and zero
  `5xx` responses across the entire run.**

The suite also writes the screenshots referenced by the README to
`docs/screenshots/`.

---

## Manual walkthrough

Run both servers (`pnpm run dev`) and open <http://localhost:5173>.

### Flow 1 — Traveler

| # | Action | Expected |
| --- | --- | --- |
| 1 | Open `/register` and create an account | Signed in immediately, redirected to attractions |
| 2 | Try `short` as a password | Rejected inline with the rule shown |
| 3 | Open **Attractions** and type `museum` | Results narrow; the URL gains `?search=museum` |
| 4 | Choose a category from the dropdown | Results narrow further; a filter chip appears |
| 5 | Click **Clear filters** | Full catalogue returns |
| 6 | Open any attraction | Name, description, address, coordinates and a map with pins |
| 7 | Press **Save** in the sidebar | Toast confirms; the button reads "Saved" |
| 8 | Repeat for two more attractions | |
| 9 | Open **Saved Places** | All three are listed |
| 10 | Press **New itinerary**, name it, create | Empty itinerary opens |
| 11 | Press **Add stop** three times | Three stops appear, numbered 1–3 |
| 12 | Press the down arrow on stop 1 | Stops 1 and 2 swap |
| 13 | **Refresh the page** | The new order is still there — read back from the database |
| 14 | Drag a row onto another | Order changes again and persists |
| 15 | Remove a stop | Numbers re-pack to 1–2 with no gap |
| 16 | Open **Profile** | Name, role, saved count and itinerary count are correct |
| 17 | Change the display name and save | Toast confirms; the header updates |

### Flow 2 — Curator

| # | Action | Expected |
| --- | --- | --- |
| 1 | Sign out, then sign in as `curator@cityguide.test` / `Curator123!` | **Curator Dashboard** appears in the navigation |
| 2 | Open the curator dashboard | Totals and a "worth reviewing" panel if anything needs attention |
| 3 | Press **Add attraction** | Form with details, category, image URL and a location section |
| 4 | Fill in a name and description, choose a category | |
| 5 | Type `Tower Bridge, London` in **Address** | |
| 6 | Press **Look up location** | Coordinates fill in, the resolved address is shown with attribution, and a map preview appears |
| 7 | Press **Look up location** again | Same result, labelled "served from cache" — no second network call |
| 8 | Type `zzzzqqq nowhere 12345` and look it up | "No location matched that address", suggesting a city or postcode |
| 9 | Press **Create attraction** | Returned to the table with a success toast |
| 10 | Open `/attractions` in a private window and search for it | Publicly visible to a signed-out visitor |
| 11 | Back in the dashboard, press **Edit** on that row | Form pre-filled |
| 12 | Change the name and save | Change persists; reload the public page to confirm |
| 13 | Open **Categories**, try to delete one in use | Refused with a clear explanation of how many attractions use it |

### Flow 3 — Authorization

Each row must be attempted while signed in as the stated role.

| # | As | Action | Expected |
| --- | --- | --- | --- |
| 1 | Traveler | Visit `/curator` | "You do not have permission to view this page", with navigation still available |
| 2 | Traveler | Visit `/admin` | Same refusal |
| 3 | Traveler | In the console: `fetch('/api/attractions', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:'{}'})` | `403 FORBIDDEN` — the API refuses regardless of the UI |
| 4 | Traveler | `fetch('/api/admin/users', {credentials:'include'})` | `403 FORBIDDEN` |
| 5 | Traveler | `fetch('/api/admin/audit-logs', {credentials:'include'})` | `403 FORBIDDEN` |
| 6 | Traveler | `fetch('/api/location/geocode', {method:'POST',…})` | `403 FORBIDDEN` |
| 7 | Traveler A | Open traveler B's itinerary URL directly | `403` — "That itinerary belongs to another traveler" |
| 8 | Signed out | Open `/saved` or `/itineraries` | Redirected to sign-in, then returned to the intended page |
| 9 | Signed out | `fetch('/api/saved-places')` | `401 UNAUTHENTICATED` |
| 10 | Curator | Visit `/admin` | Refused — the curator role is not sufficient for administrator functions |
| 11 | Admin | Change the only administrator's role to traveler | `409 CONFLICT` — the system cannot lock itself out |

### Cross-checking persistence directly

To confirm data lives in the database rather than the browser, inspect it
independently of the app:

```bash
# SQLite
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./database/cityguide.db');
console.log(db.prepare('SELECT itinerary_id, position, attraction_id FROM itinerary_items ORDER BY itinerary_id, position').all());
"
```

The `position` column will match the order shown in the interface, and it will
still be correct after clearing site data or opening the app in a different
browser.

---

## Accessibility checks

Worth confirming manually, as they are not fully covered by automation:

- Tab through the landing page: focus is always visible (a cobalt ring) and the
  skip link appears first.
- Open the save, add-to-itinerary and confirmation dialogs with the keyboard:
  focus moves inside, Tab cycles within, Escape closes, and focus returns to the
  control that opened it.
- Reorder an itinerary using only the keyboard: the up/down buttons are ordinary
  buttons, and a screen reader announces the move through a live region.
- Submit an invalid form: errors are announced, linked to their field with
  `aria-describedby`, and marked with an icon as well as colour.
- Zoom to 200%: no content is clipped and no horizontal scrolling appears.

---

## Continuous checks

Both suites exit non-zero on failure, so they can gate a deployment:

```bash
pnpm run test && pnpm run build && pnpm run verify:ui
```

`pnpm run build` fails on any unresolved import, which catches broken paths even
if the test suites do not exercise that page.
