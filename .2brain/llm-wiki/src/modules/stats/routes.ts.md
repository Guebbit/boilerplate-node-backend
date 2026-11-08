---
source: src/modules/stats/routes.ts
sha256: f82756ff332586d024a343e7257dce6eac9d322887b3cecd9617aa732f450594
generated_at: 2026-11-08T08:25:02.117882+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/routes.ts

## Purpose

Defines the Express `Router` for all `/stats` endpoints. Every route is a read-only `GET` that returns shop-level sales figures. The file exists as the single wiring point that couples the permission guard, the no-cache policy, and the eight stat controllers behind one consistent contract.

## Key elements

- **`router`** (exported `Router`) — the sole export; mounted by the stats module.
- **Middleware chain** (`router.use`) — `getAuth` → `isAuth` → `requirePermission('read', 'Stats')` applied to every route; no finer-grained permission exists.
- **Route definitions** — eight `GET` routes, each prefixed with `privateNoCache`:
  - `/sales` → `getSalesStats`
  - `/products` → `getProductStats`
  - `/products/:productId` → `getProductSalesSeries`
  - `/categories` → `getCategoryStats`
  - `/payments` → `getPaymentMixStats`
  - `/operations` → `getOperationsStats`
  - `/customers` → `getCustomerStats`
  - `/pipeline` → `getPipelineStats`

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth`, `isAuth`, `requirePermission`; the three-function chain enforces session-based access before any controller runs.
- **`src/infrastructure/http/middlewares/cache.ts`** — source of `privateNoCache`; applied per-route to ensure responses are private and revalidated on every request (no shared/CDN caching).
- **`src/modules/stats/controllers/get-stats.ts`** — provides all eight handler functions that the routes dispatch to.
- **`src/modules/stats/module.ts`** — the module entry point that mounts this router into the application (implied by the module pattern).
- **`src/modules/stats/tests/unit/routes.test.ts`** — unit tests verifying the route wiring, middleware order, and permission requirements.

## Notes

- The file header explicitly states the intent is **session auth, not API keys**: "a credential reaching a sales figure is a decision nobody has made." Do not swap in a token/API-key middleware without an explicit product decision.
- `privateNoCache` is applied **per route**, not via `router.use`, alongside the global auth chain. If you add a new route, remember to include it in the `router.get(...)` call.
- The doc comment references `docs/modules/stats.md` for broader module context.
