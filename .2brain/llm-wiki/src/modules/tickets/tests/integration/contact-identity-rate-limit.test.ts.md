---
source: src/modules/tickets/tests/integration/contact-identity-rate-limit.test.ts
sha256: a5d17a85e3ac588ecee7b61b1ea3917c62d15584e6078e2732157d2ff96ffe73
generated_at: 2026-10-29T06:06:43.148967+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/integration/contact-identity-rate-limit.test.ts

## Purpose

Integration test for `contactLimiters` (Anti-automation Rung 1) in the tickets module. It verifies that the identity (submitted-email) dimension caps repeat senders *on top of* the per-address budget already covered by `submission-rate-limit.test.ts`, and that the limiter is actually mounted on the real `POST /tickets` route.

## Key elements

- **`withTicketsRateLimits`** – Thin wrapper around `withReloadedRateLimits` that pre-binds the dynamic import of `@modules/tickets/rate-limits`, so each test can reload the module with different env-var overrides.
- **`describe('contactLimiters')`** – Unit-level test against a trivial handler (`appAnswering`). Confirms that a single email is limited to 2 attempts (env `…_EMAIL_MAX=2`) while a different email from the same address still succeeds, proving the identity dimension is independent of the address budget.
- **`describe('mounted on the real routes')`** – Hits `POST /tickets` through the real Express app (via `api()`) and asserts the presence of the `ratelimit` response header as proof the limiter array reached the route.

## Relationships

- **`src/modules/tickets/rate-limits.ts`** – The module under test; `contactLimiters` is extracted from it via dynamic import with env overrides.
- **`tests/support/rate-limit-harness.ts`** – Supplies `withReloadedRateLimits`, `appAnswering`, and `statusOf`, which together form the test scaffold for limiter behavior.
- **`tests/support/http.ts`** – Provides the `api()` helper used by the route-mounting test to issue a real HTTP POST.
- **`tests/support/setup-test-db.ts`** – Called once in the "mounted" block so the real route handler has a valid database connection.

## Notes

- `afterEach(() => jest.resetModules())` is required because `withReloadedRateLimits` relies on `jest.isolateModules`-style dynamic re-import; without the reset the cached module would leak overrides between tests.
- The first `describe` deliberately uses a trivial handler rather than the real contact controller — the property under test belongs to the limiter, not the route logic.
- The `ratelimit` header assertion in the second block is the same "fingerprint" pattern used in `auth-hardening.test.ts`'s login case: it proves the limiter array was passed to `ratelimit()` at runtime, not merely that the import resolves.
- A sibling test for the analogous `account` module lives at `src/modules/account/tests/integration/identity-rate-limit.test.ts`.
