---
source: src/modules/tasks/tests/integration/contact-identity-rate-limit.test.ts
sha256: f3d7c8daad27e7055ff9f9df7ca5ceba22e4bd62f220816d14aa09dcdc42a01b
generated_at: 2026-11-14T22:13:36.933574+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/contact-identity-rate-limit.test.ts

## Purpose

Integration test verifying that `contactLimiters` (from the tasks rate-limits module) enforces an identity-based (submitted-email) budget on top of the per-address submission budget. It also confirms the limiter array is actually mounted on the real `POST /tasks` route. It tests the limiter itself, not the contact controller logic.

## Key elements

- **`withTasksRateLimits`** — Convenience wrapper around `withReloadedRateLimits` that hard-codes the `@modules/tasks/rate-limits` module import, so call sites only pass env-var overrides and a picker function.
- **`describe('contactLimiters')`** — Spins up a throwaway Express app via `appAnswering` with the extracted limiters; asserts that a given email is allowed twice then rejected with 429, while a different email from the same address still succeeds.
- **`describe('mounted on the real routes')`** — Uses the real test app (`api()` + `setupTestDb()`), POSTs to `/tasks`, and asserts the response carries a `ratelimit` header (proof the limiter array reached the route handler).

## Relationships

- **`src/modules/tasks/rate-limits.ts`** — The module under test. `contactLimiters` is imported (after a dynamic re-import) and passed to the harness.
- **`tests/support/rate-limit-harness.ts`** — Supplies `appAnswering` (builds a trivial Express app wired with the given limiters), `statusOf` (runs a supertest call and returns the status), and `withReloadedRateLimits` (clears the module registry, re-imports, and invokes the picker with fresh env-var overrides).
- **`tests/support/http.ts`** — Provides `api()`, the supertest-wrapped real application instance used by the "mounted on the real routes" block.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database so the real-route test can exercise the full middleware chain.

## Notes

- `afterEach(() => jest.resetModules())` is required in the first `describe` block because `withReloadedRateLimits` performs a dynamic `import()` and depends on a fresh module registry per test.
- The first block deliberately uses a **trivial handler** rather than the real contact controller — the property under test (the limiter's identity dimension) is independent of controller logic.
- The `ratelimit` header assertion in the second block is a "fingerprint" check: its presence proves the limiter array was passed to the route, not merely that the module compiles.
- The address-only budget case is covered separately in `submission-rate-limit.test.ts`; this file only exercises the additional identity (email) dimension.
- The same pattern (identity budgets on top of address budgets) is replicated for account in `src/modules/account/tests/integration/identity-rate-limit.test.ts`.
