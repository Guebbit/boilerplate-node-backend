---
source: src/modules/shop-tasks/routes.ts
source_sha256: 100662f5f1e231c8ff64e47aafe98e83aa65d08f93532508dd793b9d5039e929
context_sha256: 2f5510591e56f4a5e1ad06c8edb978054836ba09dcd036d4667a8218b3381cc3
generated_at: 2026-11-22T07:42:30.232913+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/routes.ts

## Purpose
Defines the Express route table for the `shop-tasks` module. It exposes a single read endpoint: the work summary behind the staff navigation badges. It requires a session, not an API key. Counts are read as the caller, and an API key resolves to no `AuthContext`, so it would silently widen the orders scope.

## Key elements
- `router`: the exported Express `Router`.
- `router.use(getAuth, isAuth)`: applies authentication to every route on this router.
- `GET /summary`: runs `noStore`, then `getShopWorkSummary`.

## Relationships
- `src/kernel/middlewares/authorizations.ts`: provides `getAuth` and `isAuth`, which gate all routes here.
- `src/infrastructure/http/middlewares/cache.ts`: provides `noStore`, which is applied to `/summary`.
- `src/modules/shop-tasks/controllers/get-shop-work-summary.ts`: provides the `getShopWorkSummary` handler for `GET /summary`.
- `src/modules/shop-tasks/module.ts`: a graph neighbor of this file. The file content does not show how it uses `router`.

## Notes
- Being signed in is the only gate at this level. Which counts come back is decided per key, by the caller's rules, not by this router.
- `noStore` is there because the response is one person's view, which a shared cache must never hold (RFC 9111 §3.5).
