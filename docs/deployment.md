# Deployment

Three free services, plus a single-service alternative.

| Component | Recommended | Alternative |
| --- | --- | --- |
| Database | Supabase (PostgreSQL) | Neon, Railway, any PostgreSQL |
| API | Render (web service) | Railway, Fly.io |
| Frontend | Vercel | Netlify, Cloudflare Pages |

The application runs identically on one host: the API serves the built SPA when
`frontend/dist` exists. See [Single-service deployment](#single-service-deployment).

---

## Before you start

Two things are easy to get wrong and account for most post-deployment problems:

1. **`CORS_ORIGINS` must contain the exact frontend origin** — scheme, host and
   port, no trailing slash.
2. **The session cookie must be configured for cross-site use.** If the frontend
   and API are on different sites (Vercel and Render are), the cookie needs
   `SameSite=None; Secure`. Without it, sign-in appears to succeed — the API
   returns `200` and sets a cookie — but the browser discards it, so the next
   request is anonymous. This looks like a login bug and is not one.

---

## 1. Database — Supabase

1. Create a project at [supabase.com](https://supabase.com) and wait for it to
   finish provisioning.
2. Open **Project Settings → Database → Connection string → URI**.
3. Choose the connection type:
   - **Connection pooling** (port `6543`) for serverless or short-lived hosts.
   - **Direct connection** (port `5432`) for a long-running server such as
     Render — this is the recommended pairing.
4. Copy the URI and replace `[YOUR-PASSWORD]` with the database password.

```
postgresql://postgres.abcdefghijklm:N0tARealPassword@aws-0-eu-west-2.pooler.supabase.com:5432/postgres
```

You do not need the anon key or the service-role key. All access goes through the
API over this connection, and the migration enables Row Level Security with
deny-by-default policies so the anon key cannot reach the tables.

**The schema creates itself.** The API runs migrations at boot, and the
PostgreSQL migration is idempotent. To seed the catalogue, run the seeder once
locally against the same `DATABASE_URL`:

```bash
DATABASE_URL="postgresql://…" pnpm run migrate
DATABASE_URL="postgresql://…" pnpm run seed
```

---

## 2. API — Render

`render.yaml` is included; you can also configure the service by hand.

### Manual setup

1. **New → Web Service**, connect your repository.
2. Settings:

   | Setting | Value |
   | --- | --- |
   | Root directory | *(repository root)* |
   | Build command | `corepack enable && pnpm install --frozen-lockfile` |
   | Start command | `pnpm --filter cityguide-backend run start` |
   | Health check path | `/api/health` |

3. Environment variables:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | the Supabase URI |
   | `CORS_ORIGINS` | `https://your-app.vercel.app` |
   | `SESSION_COOKIE_SECURE` | `true` |
   | `SESSION_COOKIE_SAMESITE` | `none` |
   | `TRUST_PROXY` | `true` |
   | `NOMINATIM_USER_AGENT` | `CityGuide/1.0 (+https://your-app.vercel.app) you@your-domain.example` |
   | `LOG_LEVEL` | `info` |

4. Deploy, then confirm `https://your-api.onrender.com/api/health` returns
   `{"success":true,…}`.

### Notes

- **Migrations run automatically** at boot, so no release command is needed.
- **`TRUST_PROXY=true`** makes `req.ip` the real client address. Without it,
  rate limiting would treat every request as coming from the proxy and the first
  burst of traffic would lock everyone out.
- **Free instances sleep** after inactivity; the first request afterwards takes a
  few seconds. The frontend shows loading states throughout, so this is visible
  rather than broken.
- **`--frozen-lockfile`** keeps the build reproducible. If the lockfile is out of
  date the build fails loudly instead of silently resolving different versions.

---

## 3. Frontend — Vercel

`vercel.json` is included.

1. **Add New → Project**, import the repository.
2. Settings:

   | Setting | Value |
   | --- | --- |
   | Root directory | `frontend` |
   | Framework preset | Vite |
   | Build command | `pnpm run build` |
   | Output directory | `dist` |

3. Environment variable:

   | Variable | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://your-api.onrender.com/api` |

   This is compiled into the bundle, so it must include `/api` and must be set
   **before** the build. Changing it requires a redeploy.

4. Deploy, then copy the assigned URL into the API's `CORS_ORIGINS` and redeploy
   the API.

---

## 4. Verify the deployment

1. Open the frontend URL.
2. Sign in with a demo account (or register a new one).
3. Open your browser's developer tools and check the session cookie:
   - **Name**: `cityguide_session`
   - **HttpOnly**: yes
   - **Secure**: yes
   - **SameSite**: `None` (cross-site deployment) or `Lax` (same-site)
4. Confirm the application's own requests include the cookie in the **Request
   Headers**.
5. If signing in does not persist, the cause is almost always one of:

   | Symptom | Cause |
   | --- | --- |
   | Cookie set but never sent | `SESSION_COOKIE_SAMESITE` is not `none` on a cross-site deployment |
   | Cookie rejected entirely | `SESSION_COOKIE_SECURE=true` without HTTPS |
   | `CORS` error in the console | The frontend origin is missing from `CORS_ORIGINS` |
   | `403 Requests from … are not accepted` | The origin check rejected a write; add the origin to `CORS_ORIGINS` |
   | Every client IP looks identical | `TRUST_PROXY` is not `true` behind the proxy |

---

## Single-service deployment

The API serves the built SPA when `frontend/dist` is present, so the whole
product can run on one host with no cross-site cookie configuration at all —
`SameSite=Lax` and a relative API path both work:

```bash
pnpm install
pnpm run build                     # produces frontend/dist
pnpm run start                     # API + SPA on one port
```

On a platform such as Railway or Fly.io:

- Build: `pnpm install && pnpm run build`
- Start: `pnpm --filter cityguide-backend run start`
- Environment: `NODE_ENV=production`, `DATABASE_URL`, `TRUST_PROXY=true`,
  `SESSION_COOKIE_SECURE=true`, `NOMINATIM_USER_AGENT`
- Leave `VITE_API_URL` unset — the frontend will call `/api` on the same origin.

This is the simplest correct deployment and is recommended if you do not
specifically need a CDN for the frontend.

---

## Local production check

Reproduce the single-service deployment before pushing:

```bash
pnpm install
pnpm run build
NODE_ENV=production SESSION_COOKIE_SECURE=false pnpm run start
# open http://localhost:4000
```

`SESSION_COOKIE_SECURE` is set to `false` here only because localhost is plain
HTTP; a browser will not store a `Secure` cookie over `http://`. Never do this on
a real deployment.

---

## Environment variables

Full documentation is in [`.env.example`](../.env.example). The ones that matter
in production:

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` disables debug output and enables secure cookies by default |
| `DATABASE_URL` | yes | Without it the app falls back to SQLite, which does not persist on ephemeral hosts |
| `CORS_ORIGINS` | yes | Exact frontend origin(s), comma-separated |
| `SESSION_COOKIE_SECURE` | yes | `true` — requires HTTPS |
| `SESSION_COOKIE_SAMESITE` | cross-site only | `none` when frontend and API are on different sites |
| `TRUST_PROXY` | behind a proxy | `true` |
| `NOMINATIM_USER_AGENT` | strongly recommended | Add a real contact before public use |
| `VITE_API_URL` | separate frontend | Full API base including `/api`; build-time only |
| `LOG_LEVEL` | no | Defaults to `info` in production |

---

## Post-deployment checklist

- [ ] `/api/health` returns `200` and reports `"database": "postgres"`
- [ ] The catalogue lists seeded attractions
- [ ] Registration works and the session persists across a refresh
- [ ] Saving a place survives a refresh
- [ ] An itinerary, its order and a reorder all survive a refresh
- [ ] Curator sign-in reaches the dashboard; a traveler is refused
- [ ] **Look up location** returns coordinates (proves the User-Agent is accepted)
- [ ] Admin sign-in reaches the dashboard; the audit log is populated
- [ ] No `CORS` or CSP errors in the browser console
- [ ] `NOMINATIM_USER_AGENT` identifies the deployment with a real contact
- [ ] Demo accounts are either removed or clearly marked as demo credentials

---

## Troubleshooting

**`DATABASE_DRIVER=postgres requires DATABASE_URL`**
`DATABASE_DRIVER` was set explicitly without a connection string. Set
`DATABASE_URL` or remove `DATABASE_DRIVER`.

**Build fails with `Ignored build scripts: esbuild`**
pnpm is blocking esbuild's postinstall. The repository's `pnpm-workspace.yaml`
already declares it under `allowBuilds`. If your platform ignores that, run
`pnpm approve-builds` or set `enable-pre-post-scripts=true`.

**`self-signed certificate` or TLS errors from the database**
Supabase requires TLS and the driver enables it automatically for supabase.co and
supabase.com hosts. For another provider set `DATABASE_SSL=true`.

**Sign-in returns `200` but the user is still anonymous**
See the table in [Verify the deployment](#4-verify-the-deployment). It is almost
always `SameSite`.

**Rate limiting blocks everyone at once**
Set `TRUST_PROXY=true` so the client IP is read from `X-Forwarded-For` rather
than being the proxy's address.

**Location lookup returns "refused this request"**
Nominatim rejected the User-Agent. Set `NOMINATIM_USER_AGENT` with a real contact
address or URL; placeholder domains are blocked.
