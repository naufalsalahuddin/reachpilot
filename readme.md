# Outreach — Express + Prisma API & React SPA

Cold-outreach system, split into two independently deployable apps:

```
outreach-web/            # the API service (deploy anywhere: VPS, Docker, Render…)
  src/                   #   Express + Prisma (routes, jobs, lib, sending, tracking)
  prisma/schema.prisma   #   introspected from the existing MySQL DB (prisma db pull)
  bin/tick.js            #   the cron job worker (source → audit → draft → send)
  frontend/              # the Vite + React SPA (build → static host / CDN)
    src/pages, components
```

The frontend talks to the API over HTTP with a **credentialed session cookie**.

## Run locally (two processes)

```bash
# 1) API  (port 3005)
npm install
npx prisma generate          # client is generated from prisma/schema.prisma
PORT=3005 npm run dev

# 2) Frontend (port 5173) — Vite proxies /api,/t,/u,/cron to the API in dev
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. In dev the Vite proxy keeps API calls same-origin, so
the session cookie just works — no CORS setup needed.

## Deploy separately

- **API**: host the repo root anywhere Node runs. Set `DATABASE_URL`, `SESSION_SECRET`,
  `CRON_TOKEN`, `APP_SECRET`, `PUBLIC_BASE_URL`, and — for cross-site cookies —
  `FRONTEND_ORIGIN=https://app.yourdomain.com`, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`.
  Point a cron at `GET /cron/tick?token=CRON_TOKEN` (or run `npm run tick`) every few minutes.
- **Frontend**: `cd frontend && VITE_API_BASE=https://api.yourdomain.com npm run build`,
  then serve `frontend/dist` from any static host.

## Schema changes (Prisma migrations)

The schema now uses **versioned Prisma migrations** (baselined from the original DB in
`prisma/migrations/00000000000000_init`). To change the schema:

```bash
# 1) edit prisma/schema.prisma
# 2) create + apply a migration (also regenerates the client)
npx prisma migrate dev --name add_something
```

In production apply pending migrations with `npx prisma migrate deploy`.
`npx prisma migrate status` shows whether the DB is up to date. (The old manual
`ALTER TABLE` + `prisma db pull` flow still works but bypasses migration tracking —
prefer `migrate dev` so changes are versioned and reproducible.)
