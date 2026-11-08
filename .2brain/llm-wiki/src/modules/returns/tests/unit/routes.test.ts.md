---
source: src/modules/returns/tests/unit/routes.test.ts
sha256: 1ed9d7463ecba0907a9903d123bd05dfa4b567e4101a0de66a646a353c7079a6
generated_at: 2026-11-08T08:13:22.947459+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/routes.test.ts

## Purpose
Unit test that asserts the structure of the returns route table: which routes are mounted, what authorization guards protect them, their relative order, and which middleware (rate-limit, idempotency) is attached. It exists to catch accidental route additions/removals, guard regressions, and ordering mistakes without spinning up a server.

## Key elements
- **`routeSignatures(router)`** — helper (from `tests/support/routes.ts`) that serialises the router into a flat array of `"METHOD /path"` strings; used to assert the full set of mounted routes.
- **`guardsOn(router, signature)`** — returns the list of guard names applied to a given route; used to verify `isAuth` presence and `requirePermissionGuard` scope.
- **`chainOf(router, signature)`** — returns the ordered middleware chain for a route; used to assert rate-limit key (`returns-write`), idempotency (`idempotencyKey`), and guard sequencing on `POST /`.
- **`securityMock()` / `authGuardsMock()`** — test doubles (also from `tests/support/routes.ts`) injected via `jest.mock` to replace the real rate-limit and authorization middleware so guard names are introspectable.
- **`router`** — the object under test, imported from `@modules/returns/routes`.

## Relationships
- **`src/modules/returns/routes.ts`** — the module under test; exports `router`, the Express (or similar) router this file inspects.
- **`tests/support/routes.ts`** — provides the introspection helpers (`routeSignatures`, `guardsOn`, `chainOf`) and the middleware mocks (`securityMock`, `authGuardsMock`) that make guard/middleware inspection possible without a live request.

## Notes
- **Route-order gotcha:** `GET /options` must appear *before* `GET /:id` in the router; a test explicitly asserts this index ordering. Reordering in `routes.ts` would cause `"options"` to be captured as an `:id` parameter.
- **Guard-order rationale on `POST /`:** the test asserts the sequence *budget → step-up → idempotency ledger* and documents why: the idempotency ledger records any JSON response, so a step-up challenge placed *after* it would be replayed as the answer to the same key.
- **Only `POST /` carries the `returns-write` budget key.** All other routes (including `POST /:id/receive`) are exempt from rate-limiting, though `POST /:id/receive` still participates in idempotency.
- **Mock pattern:** both `jest.mock` calls delegate to the real support module via `jest.requireActual`, so the mocks are defined alongside the helpers rather than inline.
