---
source: src/modules/tasks/tests/integration/contact-identity-rate-limit.test.ts
sha256: 0be6ce089437cc862a95d71af077a052d39ab11d10da16b9e097e5554dc82969
generated_at: 2026-11-08T08:38:27.321539+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/contact-identity-rate-limit.test.ts

## Purpose

Integration test for `contactLimiters`'s identity (submitted-email) budget — the dimension layered on top of the per-address `submissionLimiter`. It verifies the limiter enforces a per-identity cap in isolation (via a trivial handler) and that the limiter is actually mounted on the real `POST /tasks` route.

## Key elements

- **`withTasksRateLimits`** — Thin wrapper around `withReloadedRateLimits` that hard-codes the `@modules/tasks/rate-limits` import, so callers only supply env overrides and a picker function.
- **`describe('contactLimiters')`** — Uses `appAnswering` to build a minimal Express app wired to the limiter, then asserts that the same email succeeds twice and fails on the third (2 → 429), while a different email still succeeds.
- **`describe('mounted on the real routes')`** — Calls the real `POST /tasks` endpoint via `api()` and asserts the presence of the `ratelimit` response header as proof the limiter array reached the route.

## Relationships

- **`src/modules/tasks/rate-limits.ts`** — Module under test; `contactLimiters` is extracted from it via dynamic import inside `withTasksRateLimits`.
- **`tests/support/http.ts`** — Supplies `api` for the route-mounting test.
- **`tests/support/rate-limit-harness.ts`** — Supplies `appAnswering` (trivial-handler app factory), `statusOf` (supertest status extractor), and `withReloadedRateLimits` (module-reload + env-override helper).
- **`tests/support/setup-test-db.ts`** — Called in the route-mounting describe block to seed/prepare the test database.

## Notes

- The isolation test intentionally uses a **trivial handler**, not the contact controller, because the property under test (per-identity cap) belongs to the limiter itself.
- `jest.resetModules()` in `afterEach` is required for the dynamic-import / module-reload pattern used by `withReloadedRateLimits`.
- The address-only budget is covered separately in `submission-rate-limit.test.ts`; this file only asserts the *added* identity dimension.
- The `ratelimit` header check in the second block is a wiring smoke test (present = array reached the route), not a behavioral assertion — mirroring the pattern in `auth-hardening.test.ts`.
