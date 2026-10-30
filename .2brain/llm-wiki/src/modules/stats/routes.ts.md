---
source: src/modules/stats/routes.ts
sha256: d002f5f726d03d19dc2013154793e89777575890f62a59c41bef970e48079bd4
generated_at: 2026-10-29T05:55:35.944634+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/routes.ts

## Purpose

Defines the Express router for the `/stats` dashboard. All nine endpoints are read-only GET routes guarded by the `read:Stats` permission and wrapped with `privateNoCache` so no sales figure ever lands in a shared cache. The file exists as a thin, declarative wiring layer: it does no business logic itself, only maps URLs to controllers.

## Key elements

- **`router`** (exported) — the sole export; an Express `Router` instance carrying all stats routes.
- **Route table** — nine `GET` handlers:
  - `/sales`, `/products`, `/products/:productId`, `/categories`, `/payments`, `/operations`, `/customers`, `/pipeline` — each delegates to a corresponding controller in `get-stats.ts`.
  - `/limits` — delegates to `getStatsLimits`.
- **Auth chain** (`router.use`) — `getAuth → isAuth → requirePermission('read', 'Stats')` applied globally to every route.
- **`privateNoCache`** — applied per-route (not via `router.use`) so it sits after the auth chain and before the controller.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — provides `privateNoCache`, the caching strategy for every route in this file.
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, and `requirePermission`, which form the mandatory auth guard on the router.
- **`src/modules/stats/controllers/get-stats.ts`** — source of all nine handler functions this file mounts.
- **`src/modules/stats/module.ts`** — parent module that mounts `router` onto the application (typically under `/stats`).
- **`src/modules/stats/tests/unit/routes.test.ts`** — unit tests that exercise the route table defined here.

## Notes

- Auth is **session-based only** (no API-key path). The module doc-block explicitly calls this a dashboard decision, not an API design.
- `requirePermission('read', 'Stats')` is the exact guard; there is no narrower sibling permission, so no further scoping is possible here.
- `privateNoCache` is attached per-route rather than via `router.use` to keep it after the auth middlewares and visible at the point of use.
