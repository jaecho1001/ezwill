# Production Deployment Plan — Vercel + Supabase (Ontario launch)

Issue #65. Target: put the Ontario Will + POA flow in front of real clients, tested in Ontario first.

Status: function testing signed off (30/30 sweep, #65 comment). This is the concrete deploy plan.

---

## 1. Architecture: what goes where

The app is three pieces. Only two of them fit Vercel; the third needs a real host.

| Piece | Today (Docker) | Production |
|---|---|---|
| **Frontend** — Next.js 16 App Router | `frontend`, port 3010 | **Vercel** (native) |
| **Backend** — FastAPI + psycopg2 | `backend`, port 8013 | **Fly.io / Render / Railway** (container) |
| **Database** — Postgres | `db`, port 5439 | **Supabase** (managed Postgres) |

### Why the backend is NOT on Vercel
Vercel serverless functions are the wrong shape for this backend, for two concrete reasons in *our* code:

1. **SSE streaming.** `POST /api/ai/intake/chat` streams Server-Sent Events for the whole Claude tool-use loop (`ai_intake._stream_with_claude`). Vercel functions have execution-time limits and buffer responses — long-lived streaming breaks.
2. **A persistent connection pool.** `services/db.py` uses a `ThreadedConnectionPool` created once at startup (`init_pool`). Serverless spins a fresh process per invocation, so the pool never warms and you exhaust Postgres connections.

→ Run the backend as a **container** on Fly.io (recommended — cheap, global, good for long-lived HTTP) or Render/Railway. The existing `backend/Dockerfile` deploys as-is.

### How the frontend reaches the backend
`frontend/next.config.ts` already rewrites `/api/:path*` → `${NEXT_PUBLIC_API_URL}/api/:path*`. In production set `NEXT_PUBLIC_API_URL` to the backend's public URL. The browser keeps calling **same-origin** `/api/*`; Vercel's rewrite proxies to the backend. This is important: it keeps cookies same-origin (see the auth note in §5) and avoids a CORS dance for the browser.

---

## 2. Supabase (database)

1. Create a Supabase project in **Canada Central (`ca-central-1`)**, the closest available region to Ontario.
2. Get both connection strings. For the persistent container backend, use the **Supavisor session-mode pooler** (port 5432); it is intended for long-lived application processes and works with the backend's `ThreadedConnectionPool`. Do not use transaction mode (port 6543), which Supabase targets at temporary/serverless clients and which does not preserve session state between transactions. Keep the **direct** connection string (also port 5432, but on the project's `db.*` host) for migrations and administrative work. Copy the exact hosts from Supabase's Connect panel rather than distinguishing them by port alone.
3. **Tenant schema:** migrations run against schema `firm_demo` (each file starts `SET search_path TO firm_demo;`, rewritten per-tenant by `scripts/run_migrations.py`). Supabase's default schema is `public`; our app uses `firm_demo`. Create it first:
   ```sql
   CREATE SCHEMA IF NOT EXISTS firm_demo;
   ```
   (or set `DEFAULT_SCHEMA` and let `run_migrations.py` target it — confirm the runner creates the schema; if not, create it manually once.)
4. **Run migrations** against the direct connection:
   ```bash
   DATABASE_URL="postgresql://…@…:5432/postgres" DEFAULT_SCHEMA=firm_demo \
     python backend/scripts/run_migrations.py
   ```
   Migrations are checksum-tracked and idempotent (`ew_schema_migrations`), so re-running is safe. Verify `36-ai-usage-events.sql` and all of 30–36 land.
5. **`gen_random_uuid()`** (used by several tables incl. `ew_ai_usage_events`) needs `pgcrypto`. Supabase enables it by default; if a migration fails on it, `CREATE EXTENSION IF NOT EXISTS pgcrypto;`.

---

## 3. Backend host (Fly.io shown; Render/Railway analogous)

1. `fly launch` from `backend/` (it has a Dockerfile). No Postgres addon — point at Supabase.
2. Set secrets (see §4):
   ```bash
   fly secrets set DATABASE_URL="postgresql://postgres.<project-ref>:…@<region>.pooler.supabase.com:5432/postgres" \
     DEFAULT_SCHEMA=firm_demo \
     AUTH_SESSION_SECRET="…" DASHBOARD_PASSWORD="…" \
     ANTHROPIC_API_KEY="…" OPENAI_API_KEY="…" \
     STRIPE_SECRET_KEY="…" \
     CORS_ALLOW_ORIGINS="https://<your-vercel-domain>" \
     SESSION_COOKIE_SECURE=true
   ```
3. Health check: the app serves `GET /` (returns `{"status": ...}`); point the platform health check there.
4. Note the public URL (e.g. `https://ezwill-backend.fly.dev`).

---

## 4. Secrets management (#57)

**Today:** secrets live in a gitignored root `.env`; `docker-compose.yml` fail-closes with `${VAR:?message}` for `POSTGRES_PASSWORD`, `DASHBOARD_PASSWORD`, `AUTH_SESSION_SECRET`. Good for local; not a production secrets store.

**Production:** each platform IS the secrets store — do **not** ship a `.env`.

| Secret | Where it lives |
|---|---|
| `DATABASE_URL` | Fly secrets (backend) |
| `AUTH_SESSION_SECRET` | Fly secrets — **generate fresh**, never reuse the local value |
| `DASHBOARD_PASSWORD` | Fly secrets — **rotate** off the local dev value before launch |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Fly secrets |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Fly secrets |
| `NEXT_PUBLIC_API_URL` | Vercel env (frontend, "Production") |

Rules:
- **Generate a new `AUTH_SESSION_SECRET`** for production (`openssl rand -hex 32`). The whole point of the security work is that sessions are unforgeable — a leaked/dev secret defeats it.
- **Rotate `DASHBOARD_PASSWORD`.** The local/dev value must not be reused in production.
- Rotate any key that has ever been in a local `.env` that a person other than you has seen.
- `NEXT_PUBLIC_*` is **public** (inlined into the browser bundle) — only the API URL goes there, never a key.

---

## 5. Auth over HTTPS (relates to #54)

The dashboard session moves to an **HttpOnly, Secure** cookie (see the #54 change on `feature/prelaunch-hardening`). Two production requirements:
- **`SESSION_COOKIE_SECURE=true`** in production so the cookie is HTTPS-only (both Vercel and Fly serve HTTPS). Locally it's `false` (http://localhost).
- Because the frontend proxies `/api/*` **same-origin**, the cookie is first-party — `SameSite=Lax` is enough and no cross-site CORS credentials config is needed. If you ever call the backend cross-origin, you'd need `Access-Control-Allow-Credentials` + an exact origin (never `*`).

Also close before launch:
- **#56** — automated Supabase backups (Supabase does daily backups on paid plans; verify + do one restore test).
- **#58** — error tracking (Sentry on both frontend and backend) so you see failures from real clients.

---

## 6. Deploy order (runbook)

1. **Supabase**: create project → create `firm_demo` schema → run migrations (direct conn) → verify `ew_schema_migrations` has 30–36.
2. **Backend**: deploy container to Fly → set secrets (Supabase **session-mode** pooled URL, fresh `AUTH_SESSION_SECRET`, rotated `DASHBOARD_PASSWORD`, API keys, `CORS_ALLOW_ORIGINS`, `SESSION_COOKIE_SECURE=true`) → confirm `GET /` healthy → confirm `GET /api/payments/tiers` returns 200.
3. **Frontend**: import repo to Vercel → set `NEXT_PUBLIC_API_URL=https://<backend>` (Production) → deploy.
4. **Smoke test on the live URLs** (mirror the local 30/30 sweep):
   - Landing loads; `/dashboard/login` → login with the rotated password sets the HttpOnly cookie.
   - Create a self-serve draft → autosave → submit.
   - AI Draft (needs `OPENAI_API_KEY`) → generate a `.docx`.
   - Record a signing; take a (test-mode) payment.
   - `/dashboard/usage` renders (empty until real AI calls happen).
5. **DNS**: point the firm domain at Vercel; update `NEXT_PUBLIC_API_URL` / `CORS_ALLOW_ORIGINS` if the backend gets a custom domain too.

---

## 7. Pre-launch checklist (legal product — do not skip)

- [ ] `AUTH_SESSION_SECRET` freshly generated for prod; `DASHBOARD_PASSWORD` rotated off the dev value.
- [ ] Session on an **HttpOnly, Secure** cookie (#54) — no token in `localStorage`/JS-readable cookie.
- [ ] Supabase automated backups on + one restore tested (#56).
- [ ] Error tracking wired (#58).
- [ ] Replace the ⚠ **landing placeholders**: the `1,900+` / `$1,500+` stats, the three testimonials, and lawyer LSO numbers/headshots (marked `⚠ PRE-LAUNCH` in `page.tsx`).
- [ ] Produce the **hero video** (#66) or keep the warm placeholder.
- [ ] Stripe in **live** mode with a real webhook secret (test mode until then).
- [ ] Privacy Policy / Terms / Accessibility footer links point at real pages (currently inert).
- [ ] Confirm generated documents stay **English** and the questionnaire Korean toggle works on the live site.

---

## 8. Rough cost

- **Supabase** — free tier to start; Pro (~$25/mo) for daily backups + no pausing.
- **Fly.io** — a shared-cpu-1x machine (~$2–5/mo) is plenty for early traffic.
- **Vercel** — Hobby free for testing; Pro ($20/mo) when it's client-facing.

Enough to run the Ontario pilot for well under $50/mo.
