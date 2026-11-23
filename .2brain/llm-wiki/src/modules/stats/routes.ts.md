---
source: src/modules/stats/routes.ts
source_sha256: 2de2fb2c2a923075c1e23d6c6a361d1846434c4be6738c8eff912834bb9cc7c3
context_sha256: 0c46a2e70643817074a523d3f89996e26995c9dfedf075ddb9bb156f196339d2
generated_at: 2026-11-22T07:51:45.728999+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/routes.ts

## Purpose
Defines the `/stats` Express router: read-only sales and business statistics endpoints for a dashboard. Every route requires a session with `read:Stats` permission, and no response may live in a shared cache because the data is the shop's revenue. API keys are deliberately not accepted for these routes.

## Key elements
- `router` (exported): the Express `Router` holding all stats routes.
- Router-level guard: `router.use(getAuth, isAuth, requirePermission('read', 'Stats'))`. It applies to every route below it.
- `privateNoCache`: applied per route, so the browser may keep a private copy but must revalidate each time.
- Routes, all registered with `router.get` (read-only):
  - `/sales` → `getSalesStats`
  - `/products` → `getProductStats`
  - `/products/:productId` → `getProductSalesSeries`
  - `/categories` → `getCategoryStats`
  - `/payments` → `getPaymentMixStats`
  - `/operations` → `getOperationsStats`
  - `/customers` → `getCustomerStats`
  - `/pipeline` → `getPipelineStats`

## Relationships
- `src/kernel/middlewares/authorizations.ts`: provides `getAuth`, `isAuth` and `requirePermission`, which make up the guard chain.
- `src/infrastructure/http/middlewares/cache.ts`: provides `privateNoCache`, which sets the cache policy on each route.
- `src/modules/stats/controllers/get-stats.ts`: provides all eight handler functions the routes bind to.
- `src/modules/stats/module.ts`: the stats module, which is the neighbor that consumes this router. The router's mount path is not visible in this file.
- `src/modules/stats/tests/unit/routes.test.ts`: unit tests for this router.

## Notes
- `requirePermission('read', 'Stats')` is used without a narrower variant because `read:Stats` has no narrower sibling, so the plain guard is exact.
- Adding a new route here inherits the auth guard automatically. It must still add `privateNoCache` explicitly, since that is set per route and not router-wide.
- Only reads are exposed. There are no write routes.
- The file's header comment points to an access rationale document for the stats module (`#access` section); that document is not among the listed neighbors.
