---
source: src/modules/locales/routes.ts
sha256: 9b43b6a17376e9259b76359f747e96e41cc646541efb96d7f3a5ed6fece65333
generated_at: 2026-09-23T18:51:01.146343+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/routes.ts

## Purpose

Express router mounted at `/locales` that wires locale discovery (public reads) and translation administration (authenticated writes) to their controllers. It is the single entry point where middleware ordering, cache tags, and permission guards are composed per-route.

## Key elements

- **`router`** (exported) — the Express `Router()` instance; all locale HTTP routes live here.
- **`publicLocaleCache`** — a `setCache(3600, { tags: ['locales'], browserRevalidate: true })` middleware factory. Applied to the four public GETs so browsers revalidate against Redis rather than serving stale local copies after a save.
- **Public reads (4 routes):** `GET /`, `GET /tenants`, `GET /:locale/messages`, `GET /:locale`. The first also takes `getAuth` so admins see inactive languages; the rest are fully anonymous.
- **Admin writes (8 routes):** `POST /`, `PUT /:locale`, `DELETE /:locale`, `POST /:locale/entries`, `PUT /:locale/entries` (replace), `PATCH /:locale/entries` (merge), `PUT /:locale/entries/:entryId`, `DELETE /:locale/entries/:entryId`. Each chain is `getAuth → isAuthOrCredential → requirePermission('locales.*') → invalidateCache(['locales']) → controller`.
- **`GET /:locale/entries`** — the one uncached read; gated on `locales.any.update` (not `.self.read`) because it surfaces every string for the editing UI.
- **Entity-translation routes (2):** `GET /translations/:entityType/:id` and `PATCH /translations/:entityType/:id`. Uncached here; the service invalidates its own (entity-type-specific) cache tag.

## Relationships

- **`@kernel/middlewares/authorizations`** — provides `getAuth`, `isAuthOrCredential`, `requirePermission` used in every route's guard chain.
- **`@infrastructure/http/middlewares/cache`** — provides `setCache` (public read caching) and `invalidateCache` (write-side invalidation of the `locales` tag).
- **Controllers** (`get-locales`, `get-locale-messages`, `get-locale-tenants`, `write-locales`, `delete-locale`, `get-locale-entries`, `write-locale-entries`, `delete-locale-entry`, `get-entity-translations`, `upsert-entity-translations`) — the terminal handlers each route delegates to.
- **`module.ts`** — mounts this router at `/locales` in the application's module tree.
- **`tests/unit/routes.test.ts`** — unit-tests the route definitions (paths, method, middleware order).
- **`tests/support/routed-modules.ts`** — test harness that registers this router in an integration test app.

## Notes

- **Route order is load-bearing.** `/tenants` and `/:locale/messages` are declared before `/:locale`; Express's first-match-wins would otherwise swallow them with the `:locale` wildcard.
- **Cache invalidation is asymmetric.** Standard locale writes use `invalidateCache(['locales'])` in the route. Entity-translation writes deliberately skip route-level invalidation because the cache tag varies with `entityType` (e.g. `products`); the service layer handles it.
- **`PUT` vs `PATCH` on `/:locale/entries`** is a semantic split: PUT → `replaceLocaleEntries`, PATCH → `mergeLocaleEntries`. Both map to the same permission.
- **`browserRevalidate: true`** means the browser still sends a conditional request each page load (costs one `304` round-trip) but prevents the "save appears broken" failure mode where a stale browser cache masks a successful Redis invalidation.
