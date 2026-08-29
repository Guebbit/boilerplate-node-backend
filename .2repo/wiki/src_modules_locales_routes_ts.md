# src/modules/locales/routes.ts

## Purpose

Defines all HTTP routes for the locales module: three public (unauthenticated) GETs that serve translation dictionaries and tenant lists, and a set of admin-only CRUD routes for managing locales and their entries. Every write route invalidates the shared `locales` cache tag in Redis.

## Key elements

- **`router`** (exported) — the Express `Router` mounted by the locales module.
- **`publicLocaleCache`** — a `setCache(3600, …)` middleware shared by the three public GETs; uses tag `['locales']` and `browserRevalidate: true` so browsers issue conditional requests instead of serving a stale copy.
- **Public GETs** (no token required):
  - `GET /` → `getLocales` (prefixed with `getAuth` so an admin's manifest can include inactive languages).
  - `GET /tenants` → `getLocaleTenants`.
  - `GET /:locale/messages` → `getLocaleMessages`.
  - `GET /:locale` → `getLocaleDictionary` (filesystem-backed, the API's own strings).
- **Admin writes** (each guarded by `getAuth, isAuth, isAdmin` and wrapped in `invalidateCache(['locales'])`):
  - `POST /` → `createLocale`
  - `PUT /:locale` → `updateLocale`
  - `DELETE /:locale` → `deleteLocale`
  - `POST /:locale/entries` → `createLocaleEntry`
  - `PUT /:locale/entries` → `replaceLocaleEntries`
  - `PATCH /:locale/entries` → `mergeLocaleEntries`
  - `PUT /:locale/entries/:entryId` → `updateLocaleEntry`
  - `DELETE /:locale/entries/:entryId` → `deleteLocaleEntry`
- **`GET /:locale/entries`** → `getLocaleEntries` — the sole admin read; intentionally **uncached** (feeds the editing screen).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, `isAdmin`; applied per-route on every admin mount and on `GET /` for caller scoping.
- **`src/infrastructure/http/middlewares/cache.ts`** — supplies `setCache` (builds `publicLocaleCache`) and `invalidateCache` (called on every write to purge the shared Redis tag).
- **`src/modules/locales/controllers/*.ts`** — each imported function is the terminal handler for one or more routes defined here.
- **`src/modules/locales/module.ts`** — imports `router` from this file to register the routes within the locales module.

## Notes

- **Route order is load-bearing:** `GET /tenants` must appear before `GET /:locale`. Express matches first, so reversing them would turn `/locales/tenants` into a dictionary lookup for a language named "tenants".
- **Public reads are deliberately unauthenticated.** The doc comment explains this is not an oversight: a client that cannot reach the API is exactly who needs the dictionary.
- **Per-route auth guards are intentional.** A single `router.use` guard mid-file would guard by line number; spelling `getAuth, isAuth, isAdmin` on every admin mount keeps each route self-documenting and immune to reordering drift.
- **PUT vs PATCH on `/:locale/entries`:** PUT performs a full replace (`replaceLocaleEntries`); PATCH performs a merge (`mergeLocaleEntries`). Do not swap them.
- **`browserRevalidate: true`** means the browser will always revalidate (expect `304` when unchanged). Removing it would let translators see stale strings for up to an hour after saving.
