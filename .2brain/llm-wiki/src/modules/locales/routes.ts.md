---
source: src/modules/locales/routes.ts
sha256: 0e77a733d733310c3e3f6c02c714d392d899b79d0b68d65aa32f0c106cf0e0bc
generated_at: 2026-10-29T04:22:28.892756+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/routes.ts

## Purpose

Express router mounted at `/locales` that exposes locale discovery, dictionary reads, and full translation administration. Public reads require no token; all writes are individually gated with `getAuth → isAuthOrCredential → requirePermission(…)` and invalidate the shared `locales` Redis cache tag on success.

## Key elements

- **`router`** (default export) — the Express `Router` instance. All routes below are attached to it.
- **`publicLocaleCache`** — a `setCache(3600, …)` instance for the five public GETs. `keyParameters: []`, `browserRevalidate: true`, and a `scopeKey` that returns `hasAnonymousReadScope(…)` so staff (who pass `getAuth`) bypass Redis while guests hit the shared entry.
- **`messagesCache`** — same shape but adds `keyParameters: ['app']` because the dictionary is per-app and the `?app=` query param must distinguish cache entries.
- **Public reads** (5 routes): `GET /`, `GET /apps`, `GET /:locale/messages`, `GET /:locale/dictionary`, `GET /:locale`. Only `/`, `/:locale`, and `/:locale/messages` mount `getAuth` so staff can preview inactive languages; `/apps` and `/:locale/dictionary` are fully anonymous.
- **Locale CRUD & lifecycle** (6 routes): `POST /`, `PUT /:locale`, `PATCH /:locale`, `POST /:locale/activate`, `POST /:locale/deactivate`, `DELETE /:locale`. All require `update:Locale` (activate/deactivate included) or `delete:Locale`.
- **Locale-entry routes** (7 routes): list/get/create/replace/merge/delete entries under `/:locale/apps/:app/entries[/… ]`. Read side uses `update:Locale` (editing-screen visibility); write side uses `create`/`update`/`delete:Locale`.
- **Entity-translation routes** (3 routes): `GET /translations/:entityType/:id` (`read:Translation`), `PUT` and `PATCH` (`update:Translation`). Uncached; the service invalidates its own registry-declared tag (e.g. `products`) because the tag varies with `entityType`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuthOrCredential`, `requirePermission`, mounted per-route on every admin path.
- **`src/infrastructure/http/middlewares/cache.ts`** — supplies `setCache` (builds `publicLocaleCache` / `messagesCache`) and `invalidateCache` (called on every write that mutates cached data).
- **`src/kernel/access/query.ts`** — `hasAnonymousReadScope` is the `scopeKey` callback in both cache configs; it decides whether a staff caller should bypass the Redis entry.
- **Controllers** (all under `src/modules/locales/controllers/…`) — each route's terminal handler: `get-locales`, `get-locale-messages`, `get-locale-apps`, `create-locale`, `update-locale`, `activate-locale`, `delete-locale`, `get-locale-entries`, `write-locale-entries`, `delete-locale-entry`, `get-entity-translations`, `write-entity-translations`.
- **`src/modules/locales/services.ts`** (imported as `localeService`) — provides `callerScope` used inside the `scopeKey` callbacks; not called directly by the routes.

## Notes

- **Route order is load-bearing.** `/apps` and `/:locale/messages` are declared before `/:locale`; Express's first-match semantics would otherwise swallow the more specific paths.
- **No shared `router.use` for auth.** Every guard is spelled on the individual route so that the five public reads stay token-free while still *optionally* accepting a token for staff.
- **`browserRevalidate: true` on both cache configs.** An editor's save clears Redis but not the browser's local copy; the flag forces a conditional `If-None-Match` round-trip (answered `304`) so the client never serves stale data. Removing it makes saves appear broken.
- **Entity-translation cache invalidation is service-side, not route-side.** The tag depends on `entityType` at runtime, which `invalidateCache`'s fixed-array signature cannot express; the service handles it.
- **`/:locale/entries` is intentionally uncached.** It is the editing screen and must always reflect the latest state; it also requires `update:Locale` (not a read permission) because it lists every string, including those no public page has requested.
