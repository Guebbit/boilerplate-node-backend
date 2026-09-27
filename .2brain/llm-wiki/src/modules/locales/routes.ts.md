---
source: src/modules/locales/routes.ts
sha256: d7fd5a20676c3ea211b2da84d220b1f16dd2cd2e6c209affa507c7b114066c30
generated_at: 2026-09-27T15:00:21.600138+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/routes.ts

## Purpose

Express router mounted at `/locales` that wires every locale and translation endpoint to its controller. It splits the surface into a small set of public GET reads (open to unauthenticated clients) and a larger set of admin-gated writes, applying per-route authorization middleware and Redis cache invalidation inline rather than via a shared `router.use`.

## Key elements

- **`router`** (default export) — the Express `Router` instance; this is what `module.ts` mounts.
- **`publicLocaleCache`** — a `setCache(3600, …)` preset used by all four public GETs. Configures a 1-hour Redis TTL, the `'locales'` tag, `browserRevalidate: true`, and a `scopeKey` that calls `hasAnonymousReadScope` so the admin manifest (`GET /locales`) bypasses Redis while guest reads do not.
- **Public read routes** — `GET /`, `GET /tenants`, `GET /:locale/messages`, `GET /:locale`. Only `GET /` mounts `getAuth`; the other three are fully public.
- **Locale CRUD routes** — `POST /`, `PUT /:locale`, `PATCH /:locale`, `DELETE /:locale`. Each spells `getAuth → isAuthOrCredential → requirePermission('locales.any.*') → invalidateCache(['locales'])` before the controller.
- **Locale-entry routes** — `GET /:locale/entries` (deliberately uncached), plus `POST`, `PUT`, `PATCH`, and per-entry `PUT`/`DELETE` under `/:locale/entries/:entryId`. All gated by `locales.any.*` permissions and invalidate the `'locales'` cache tag.
- **Entity-translation routes** — `GET`, `PUT`, `PATCH` on `/translations/:entityType/:id`. Gated by `translations.any.*` permissions. No route-level `invalidateCache`; the service layer invalidates the entity-specific tag (e.g. `'products'`) because the tag varies with `entityType`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuthOrCredential`, `requirePermission`; every admin route chains all three before the handler.
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `setCache` (used to build `publicLocaleCache`) and `invalidateCache` (called on every write route for the `'locales'` tag).
- **`src/kernel/access/query.ts`** — provides `hasAnonymousReadScope`, consumed by `publicLocaleCache`'s `scopeKey` to distinguish guest from admin callers.
- **`src/modules/locales/module.ts`** — imports `router` and mounts it at `/locales`.
- **Locale controllers** (`create-locale`, `update-locale`, `delete-locale`, `get-locales`, `get-locale-messages`, `get-locale-tenants`, `get-locale-entries`, `write-locale-entries`, `delete-locale-entry`, `get-entity-translations`, `write-entity-translations`) — each route's terminal handler; this file contains no business logic.

## Notes

- **Route order is load-bearing.** `/tenants` and `/:locale/messages` are declared before `/:locale` because Express uses first-match-wins for path parameters. Reordering would shadow the literal routes with the `:locale` wildcard.
- **`browserRevalidate: true`** on the public cache is not cosmetic. Without it, a successful save clears Redis but leaves the browser's stale copy intact, making the UI appear broken. The flag forces a conditional revalidation request (answered `304` when unchanged).
- **`GET /:locale/entries` is intentionally uncached.** It backs the admin editing screen and must always reflect the current state; the required permission is `locales.any.update` (not a read permission) because it exposes every stored string, including those no page has requested yet.
- **Entity-translation cache invalidation lives in the service, not the route.** The tag is registry-declared and varies with `entityType`, which the fixed-array `invalidateCache(['locales'])` cannot express.
- **`PUT` vs `PATCH` semantics differ per route pair.** For locale entries and entity translations, `PUT` replaces (omitted rows are deleted) while `PATCH` merges. This is documented on each route and in the respective controller.
