# External services and attribution

CityGuide deliberately depends on very little outside its own database. This
document records exactly what is called, under what terms, and what must be
credited.

---

## Summary

| Service | Used for | Called from | Key required |
| --- | --- | --- | --- |
| **OpenStreetMap — Nominatim** | Address → coordinates | Backend only, on demand | No |
| **OpenStreetMap — raster tiles** | Map imagery | Browser, via Leaflet | No |
| Wikipedia / Wikimedia Commons | Seed data (coordinates, photos, descriptions) | Build time only, once | No |

Nothing else is integrated. In particular, no weather, book, recipe, currency,
country, earthquake, medical or vehicle APIs are used — they are not needed for
attraction discovery and itinerary planning, and adding them purely to
demonstrate an integration would make the product worse.

---

## Nominatim (geocoding)

### What it is used for

A curator types an address and presses **Look up location**. The API resolves it
to a latitude and longitude, which are then stored in CityGuide's own database.

That is the only use. Attractions are curated locally; Nominatim is never used as
a bulk point-of-interest source, and it is never used to populate the catalogue
automatically.

### Usage policy compliance

The [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
sets out firm requirements. Each is met as follows.

| Requirement | Implementation |
| --- | --- |
| **User-triggered only** | `POST /api/location/geocode` runs only when a curator submits the form. There is no scheduled job, no warm-up, no background refresh. |
| **No autocomplete** | The endpoint accepts one complete address per call. The address field does not query as the user types. |
| **Descriptive User-Agent** | `NOMINATIM_USER_AGENT` is sent on every request. The default identifies the software; deployments are expected to add a real contact. |
| **Contact address** | Either in the User-Agent, or via `NOMINATIM_EMAIL`, which is passed as the `email` parameter. |
| **At most one request per second** | Outbound calls pass through a serialising queue that enforces a minimum gap of `GEOCODE_MIN_INTERVAL_MS` (default 1100 ms). Concurrent lookups queue rather than burst. |
| **Cache results** | Successful lookups are written to `geocode_cache` with a 30-day TTL, keyed on the normalized address. A repeat lookup is served from the database and never reaches the network. |
| **No bulk use** | The endpoint is curator-only, rate limited to 20 requests per minute per IP, and takes a single address. |
| **Attribution** | Returned with every result as a structured `attribution` object and rendered in the UI. |

### Required configuration

> **Before deploying publicly**, set `NOMINATIM_USER_AGENT` to identify your
> deployment with a reachable contact:
>
> ```bash
> NOMINATIM_USER_AGENT=CityGuide/1.0 (+https://your-app.example) you@your-domain.example
> ```

The built-in default is `CityGuide/1.0 (self-hosted open-source attraction
itinerary planner)`. It carries no contact address on purpose: the OSM
Foundation rejects User-Agents containing placeholder domains such as
`example.com`, so shipping a fictitious contact would be both dishonest and
non-functional. Verified experimentally — the same request returns `200` with a
plain identifier and `403 Access denied` with an `@example.com` contact.

### The request flow

```
Curator types an address in the dashboard
        │
        ▼
POST /api/location/geocode                       session + curator role required
        │
        ▼
Backend: normalise the address to a cache key
        │
        ├── hit ──► return the stored result (fromCache: true)   ← no network call
        │
        ▼ miss
Backend: enqueue on the throttle queue (≥ 1100 ms since the last call)
        │
        ▼
GET https://nominatim.openstreetmap.org/search
        ?q=<address>&format=jsonv2&limit=1&addressdetails=1
    User-Agent: <NOMINATIM_USER_AGENT>
        │
        ▼
Backend: validate the response, clamp precision to 6 dp, upsert into geocode_cache
        │
        ▼
Frontend: fills latitude/longitude and shows a map preview + attribution
        │
        ▼
Curator saves the attraction → coordinates live in CityGuide's database
        │
        ▼
Every later view (catalogue, detail page, map, distances) reads only local data
```

### Failure handling

| Condition | Response | Client message |
| --- | --- | --- |
| No match found | `404 GEOCODING_NO_RESULTS` | "No location matched that address. Try adding a city or postcode." |
| `403` from Nominatim | `503 UPSTREAM_UNAVAILABLE` | Names the configuration problem: a valid `NOMINATIM_USER_AGENT` is needed |
| `429` from Nominatim | `503 UPSTREAM_UNAVAILABLE` | "The location service is temporarily limiting requests." |
| Network failure | `503 UPSTREAM_UNAVAILABLE` | "The location service is unavailable right now." |
| Timeout | `504 UPSTREAM_TIMEOUT` | "The location service took too long to respond." |
| Malformed response | `502 UPSTREAM_ERROR` | "The location service returned an unexpected response." |

Every failure is logged with the query and the upstream status. A `403` is logged
at `error` level because it indicates a misconfiguration rather than an outage.

### What is stored

Only what the application needs: latitude, longitude, the display name, and a
small payload (place id, OSM type/id, category, type, importance). The raw
upstream response is not stored and is never returned to the browser as-is.

---

## OpenStreetMap tiles

Map imagery is served directly from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
by Leaflet in the browser.

- Markers are placed from coordinates **already stored in CityGuide's database**.
  Rendering a map never triggers a geocoding request.
- The Leaflet attribution control is left enabled, and a second explicit credit
  line sits beneath every map.
- No paid mapping SDK is used. No tile server is scraped or bulk-downloaded.

**Attribution required and displayed:**

> © OpenStreetMap contributors — https://www.openstreetmap.org/copyright

---

## Wikipedia and Wikimedia Commons (seed data only)

Attraction descriptions, lead images and coordinates were resolved **once**,
during development, by [`backend/scripts/resolve-attraction-data.mjs`](../backend/scripts/resolve-attraction-data.mjs)
using the Wikipedia REST API. The output is committed as
[`database/seed/attractions.json`](../database/seed/attractions.json).

The running application never calls Wikipedia. This is a build-time data
preparation step, and the resulting database is the source of truth for every
attraction served.

**Attribution required and displayed:**

> Descriptions and images from Wikipedia / Wikimedia Commons, CC BY-SA —
> https://www.wikipedia.org/ and https://commons.wikimedia.org/

---

## Where attribution appears

Attribution is a licence condition, not decoration, so it is rendered in several
places rather than buried in a legal page:

| Location | Credit |
| --- | --- |
| Site footer, every page | OpenStreetMap contributors, Nominatim, Wikipedia (CC BY-SA) |
| Beneath every map | "Tiles © OpenStreetMap contributors" plus the coordinate pair |
| Leaflet attribution control | Standard OSM attribution (left enabled) |
| Attraction detail page | Wikipedia / Wikimedia Commons and OpenStreetMap |
| Curator address lookup result | "Geocoding by Nominatim (OpenStreetMap) · © OpenStreetMap contributors" |
| Sign-in page brand panel | OpenStreetMap and Nominatim |

---

## Adding a future integration

If another service is ever needed, it belongs behind a service module in
`backend/src/services/`, following the pattern established by
`geocodeService.js`:

1. **Server-side only.** API keys never reach the browser bundle.
2. **Normalise before returning.** The frontend receives a stable, minimal shape,
   never a raw upstream payload.
3. **Cache.** Store successful responses locally with a TTL.
4. **Throttle.** Respect the provider's stated limits with an explicit queue.
5. **Timeout.** Always pass an `AbortSignal`.
6. **Fail usefully.** Map upstream failures to the `UPSTREAM_*` codes with
   messages a user can act on.
7. **Attribute.** Return attribution as data so the UI can render it, and
   document it here.
8. **Justify it.** If it does not serve discovery or itinerary planning, it does
   not belong in the product.
