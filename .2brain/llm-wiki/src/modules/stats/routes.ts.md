---
source: src/modules/stats/routes.ts
sha256: 19a05d4621002302f8c618a83eac9e42120902c32e52d715c402d876db5531f8
generated_at: 2026-10-15T12:03:42.025729+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/routes.ts

## Purpose

Defines the `/stats` Express router — a set of read-only GET endpoints exposing sales, product, category, payment, operations, customer, and pipeline figures. Every route is gated behind the `stats.any.read` permission and marked `privateNoCache`, because the data represents the shop's revenue and must never land in a shared cache.

## Key elements

- **`router`** (exported `Router`) — the single public export; mounted elsewhere (see `module.ts`). Applies `getAuth → isAuth → requirePermission('stats.any.read')` as router-level middleware, then registers eight GET routes.
- **Route handlers** — all imported from `./controllers/get-stats`: `getSalesStats`, `getProductStats`, `getProductSalesSeries`, `getCategoryStats`, `getPaymentMixStats`, `getOperationsStats`, `getCustomerStats`, `getPipelineStats`.
- **`/products/:productId`** — the only parametric route; returns a time-series breakdown for a single product.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, and `requirePermission`; applied once at the router level so no individual route repeats the guard.
- **`src/infrastructure/http/middlewares/cache.ts`** — supplies `privateNoCache`, attached per-route to ensure responses carry private (browser-local) caching only.
- **`src/modules/stats/controllers/get-stats.ts`** — provides every route handler; this file contains no business logic.
- **`src/modules/stats/module.ts`** — the module entry point that mounts `router` onto the application's `/stats` prefix.
- **`src/modules/stats/tests/unit/routes.test.ts`** — unit tests exercising the route table and middleware wiring defined here.

## Notes

- The permission `stats.any.read` has no narrower sibling, so there is no per-route permission split; adding one later would mean replacing the router-level `use(...)` with per-route middleware.
- The auth chain is session-based (`getAuth`/`isAuth`), not API-key-based — consistent with a dashboard context rather than a public API.
- `privateNoCache` is applied per-route, not at the router level, so future non-stats routes added to this same `Router` would not silently inherit the no-cache behaviour.
