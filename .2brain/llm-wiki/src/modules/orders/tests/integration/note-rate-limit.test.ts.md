---
source: src/modules/orders/tests/integration/note-rate-limit.test.ts
source_sha256: b658fbaece7b8118b20041cf55384a9fba82807ff660894d5d25d2ec0835c0ed
context_sha256: d2ea2bf0e0a4050f0b55ed04cb501c404e03f818a9f3707357e473af2e951c40
generated_at: 2026-11-22T06:29:41.915470+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/note-rate-limit.test.ts

## Purpose
Integration test for the per-account staff-note rate limit on `POST /orders/{id}/timeline/notes`. It exercises the limiter (`ordersNoteLimiter`) over real HTTP using supertest against a minimal Express handler, since the budget is a property of the limiter itself. The header comment says `routes.test.ts` separately asserts that the real route mounts the limiter after the permission check.

## Key elements
- `asAccount`: middleware standing in for `getAuth`. It sets `request.authContext` to a stub `AuthContext` whose `id` comes from the `x-account` header, or `'anonymous'` if the header is absent.
- `attempt(app, account)`: sends `POST /notes` as the given account and resolves to the response status.
- `notesApp(limit)`: loads `@modules/orders/rate-limits` through `withReloadedRateLimits` with `NODE_ORDER_NOTE_RATE_LIMIT_MAX` set to `String(limit)`. It then builds an Express app with `asAccount`, then `ordersNoteLimiter`, then a handler returning `201 {}` on `POST /notes`.
- `describe('the staff-note budget')`: has one test. With a limit of 2, account `a` gets statuses `[201, 201, 429]` over three attempts, and account `b` still gets `201`. This shows the budget is per account.

## Relationships
- `src/modules/orders/rate-limits.ts`: the module under test. The test imports `ordersNoteLimiter` from it and configures its budget through the `NODE_ORDER_NOTE_RATE_LIMIT_MAX` env var.
- `tests/support/rate-limit-harness.ts`: supplies `withReloadedRateLimits`, which re-imports the rate-limits module with the given env overrides applied.
- `tests/support/stub.ts`: supplies `asStub`, used to build a partial `AuthContext`.
- `src/types/auth-context.ts` / `src/types/index.ts`: the `AuthContext` type is imported from `@types` (the types index). It is used only as a type, for the stub.

## Notes
- `afterEach(() => jest.resetModules())` clears the module registry so each test re-imports the limiter with fresh env-derived config and fresh counters.
- The limiter is keyed by `authContext.id`, which is why `asAccount` must run before it.
- The real route wiring, including permission ordering, is deliberately not tested here.
