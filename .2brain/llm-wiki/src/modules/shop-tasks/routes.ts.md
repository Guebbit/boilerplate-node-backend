---
source: src/modules/shop-tasks/routes.ts
sha256: 30d5906a2a432a334ec1f434c5f9a4ec074c74040ccf7a691d85b3c579d75878
generated_at: 2026-11-08T08:16:04.750679+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/routes.ts

## Purpose

Express route table for the shop-tasks module. It exposes a single read-only endpoint (`GET /summary`) that returns per-staff work counts used to drive navigation badges in the shop UI. Every count is resolved as the calling user; API-key auth is deliberately excluded because it would silently widen the orders scope.

## Key elements

- **`router`** (exported) — the Express `Router` instance that `module.ts` mounts.
- **`GET /summary`** — the only route. Chained: `noStore` → `getShopWorkSummary`. Returns the caller's shop-work summary.
- **Module-level middleware** (`router.use(getAuth, isAuth)`) — enforces session-based authentication for all routes on this router. No route bypasses it.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth` and `isAuth`; applied router-wide before any handler runs.
- **`src/infrastructure/http/middlewares/cache.ts`** — supplies `noStore`, applied only to the `/summary` route to prevent shared caches from serving one user's counts to another (RFC 9111 §3.5).
- **`src/modules/shop-tasks/controllers/get-shop-work-summary.ts`** — the sole controller; performs the actual data read and response shaping for `GET /summary`.
- **`src/modules/shop-tasks/module.ts`** — imports and mounts the exported `router` into the application's route tree.

## Notes

- The auth gate is intentionally *only* "signed in." Which specific counts the caller receives is decided downstream by the caller's own rules inside the controller, not by a role check at the route layer.
- `noStore` is a per-route concern, not a router-level one. If additional endpoints are added, each must independently declare its caching policy.
- The module docstring references `docs/modules/shop-tasks.md#the-nav-badge-summary` for the product-level rationale behind the endpoint.
