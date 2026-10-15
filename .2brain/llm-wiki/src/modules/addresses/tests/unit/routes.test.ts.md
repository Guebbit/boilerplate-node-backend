---
source: src/modules/addresses/tests/unit/routes.test.ts
sha256: 36354babe9b3ba964971bea384410342e87ab228f3cf2c7bf16e57eaae91582f
generated_at: 2026-10-15T10:19:43.085778+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/unit/routes.test.ts

## Purpose

Contract test that locks down the addresses router's route table, middleware stack, and authorization posture. It asserts *what* is mounted (exact endpoints, order, guards) rather than *how* handlers behave, so structural regressions (a route losing `noStore`, gaining a permission key, or picking up unexpected middleware) are caught immediately.

## Key elements

- **`describe('what is mounted')`** — Verifies the six endpoint signatures in order; asserts router-level middleware is exactly `['getAuth', 'noStore']`; iterates every route to confirm `noStore` appears in its guard list.
- **`describe('authorization')`** — Confirms every route includes `isAuth`; asserts no route carries `requirePermissionGuard` (all actions are first-person on the caller's own rows).
- **`describe('no unexpected middleware')`** — Filters the full middleware chain (`chainOf`) for any `credentials-` prefix (rate limiting) and any `setCache` prefix; both lists must be empty.
- **`jest.mock('@infrastructure/http/middlewares/cache')`** — Replaces the real cache middleware with `cacheMock()` so the router under test doesn't execute actual cache logic during these structural checks.

Helpers imported from `@tests/routes`: `routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`, `cacheMock`.

## Relationships

- **`src/modules/addresses/routes.ts`** — The sole subject under test; its exported `router` is passed to every helper.
- **`tests/support/routes.ts`** — Supplies all four inspection helpers and `cacheMock`. The test is purely a consumer of that shared toolkit; no other test in the repo uses these helpers differently.

## Notes

- The file-level doc comment flags that this router shares the `/account` prefix with `@modules/account/routes`. If middleware ordering or guard coverage ever diverges between the two, this test will fail but the account-side equivalent may not — keep them in lockstep.
- The `it.each(routeSignatures(router))` pattern means the per-route assertions auto-track the endpoint list. If a new route is added without the required guards, the test fails on the *new* signature rather than on a hardcoded list.
- The `noStore` check is deliberately done per-route (via `guardsOn`) in addition to the router-level check, specifically to catch routes mounted *above* `router.use(noStore)` that would otherwise be silently cacheable.
