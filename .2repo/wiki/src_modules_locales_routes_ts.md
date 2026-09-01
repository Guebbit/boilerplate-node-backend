# src/modules/locales/routes.ts

## Purpose

Defines the Express router mounted at `/locales`. It wires public (unauthenticated) locale reads to their controllers with a shared Redis cache, and admin-gated CRUD writes to the dynamic translation tier. It exists as the single mount point that the locales module registers, keeping route ordering, guard stacking, and cache invalidation in one place.

## Key elements

- **`router`** (exported) — the Express `Router` instance the module mounts at `/locales`.
- **`publicLocaleCache`** — `setCache(3600, { tags: ['locales'], keyParameters: [], browserRevalidate: true })`; applied to the four public GET routes. The `browserRevalidate` flag forces the browser to revalidate instead of serving from its own store.
- **Public GET routes** — `GET /` (locale manifest, `getAuth`-scoped), `GET /tenants`, `GET /:locale/messages`, `GET /:locale`. All use `publicLocaleCache`.
- **Admin write routes** — `POST /`, `PUT /:locale`, `DELETE /:locale`, `POST /:locale/entries`, `PUT /:locale/entries` (replace), `PATCH /:locale/entries` (merge), `PUT /:locale/entries/:entryId`, `DELETE /:locale/entries/:entryId`. Each stacks `getAuth → isAuth → isAdmin → invalidateCache(['locales'])` before the controller.
- **`GET /:locale/entries`** — the one admin read that is *not* cached; feeds the editing screen.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, `isAdmin`, applied per-route on every admin write and on the manifest GET.
- **`src/infrastructure/http/middlewares/cache.ts`** — supplies `setCache` (public GETs) and `invalidateCache` (every admin write).
- **Controller files** (`get-locales`, `get-locale-messages`, `get-locale-tenants`, `write-locales`, `delete-locale`, `get-locale-entries`, `write-locale-entries`, `delete-locale-entry`) — provide the handler functions bound to each route.
- **`src/modules/locales/module.ts`** — imports and mounts `router` under the `/locales` path.
- **`src/modules/locales/tests/unit/routes.test.ts`** — unit-tests route registration and middleware ordering.
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** / **`tests/cross-cutting/authenticated-controllers.test.ts`** — cross-cutting tests asserting every write route carries the admin guard chain and that controllers enforce auth.

## Notes

- **Route order is load-bearing.** `/tenants` and `/:locale/messages` are declared *before* `/:locale`; Express's first-match-wins means a later `/:locale` wildcard would swallow those literal paths.
- **Guards are per-route, not `router.use`.** Each write route spells out `getAuth, isAuth, isAdmin` individually so the cross-cutting "write routes are guarded" test can assert the chain without inferring from a shared middleware.
- **`browserRevalidate` is deliberate.** Without it, an admin's save clears Redis but the editor's browser keeps its stale copy, making the UI appear broken. The cost is one conditional `304` per read.
- **PUT vs PATCH on entries:** `PUT /:locale/entries` performs a full replace; `PATCH /:locale/entries` performs a merge. The distinction lives in the controller; the routes only differ in method.
