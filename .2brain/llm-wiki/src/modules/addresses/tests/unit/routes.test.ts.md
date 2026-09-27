---
source: src/modules/addresses/tests/unit/routes.test.ts
sha256: b457af1404595c3adef135dd01e31a2d0f633918fa3ead58c6f68207294f238e
generated_at: 2026-09-27T14:40:24.824460+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/unit/routes.test.ts

## Purpose

Unit test that pins the addresses router's contract: the exact set of endpoints (and their order), the middleware/guards applied at the router level and per-route, and the absence of middleware that must not be present. It exists to catch silent regressions where a route is reordered, a guard is dropped, or an unwanted cache/rate-limit middleware sneaks in.

## Key elements

- **Mock of `@infrastructure/http/middlewares/cache`** — replaced at import time with `cacheMock()` from `@tests/routes`, so any accidental cache usage is observable in assertions.
- **`describe('what is mounted')`** — asserts the five route signatures in order (`GET/POST/PUT/PATCH/DELETE /addresses…`), asserts router-level middleware is exactly `['getAuth', 'noStore']`, and iterates every route to confirm `noStore` is present.
- **`describe('authorization')`** — confirms every route carries `isAuth` and that **no** route uses `requirePermissionGuard` (all actions are self-service on the caller's own rows).
- **`describe('no unexpected middleware')`** — asserts no route chain contains `credentials-*` rate-limiting and no route chain contains `setCache*`.
- **Test utilities from `@tests/routes`** — `routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`, `cacheMock`; these inspect the Express router tree without spinning up a server.

## Relationships

- **`src/modules/addresses/routes.ts`** — the SUT. This test imports its `router` export and inspects it.
- **`tests/support/routes.ts`** (alias `@tests/routes`) — supplies all four inspection helpers and the `cacheMock()` factory; also the target of the `jest.mock` factory (via `jest.requireActual`).

## Notes

- The `jest.mock` factory calls `jest.requireActual` on the *test-support* module, not the real cache middleware. This means the mock must be registered before the routes module is imported — the `jest.mock` call is hoisted by Jest, but the `requireActual` indirection is a convention in this repo; don't "simplify" it away.
- The file-level doc comment explains **why** `noStore` is non-negotiable: the address book is identity-adjacent, and a route accidentally mounted *above* `router.use(noStore)` would become silently cacheable by a shared proxy or browser. The `it.each` block is the regression guard for that exact ordering mistake.
- "No credential rate-limiting" is intentional — a global brake elsewhere covers this module. Adding per-route `credentials-*` middleware would be a design change, not a test fix.
- All per-route assertions are parameterised with `it.each(routeSignatures(router))`, so adding a new route automatically extends coverage; removing a route changes the "documented order" assertion.
