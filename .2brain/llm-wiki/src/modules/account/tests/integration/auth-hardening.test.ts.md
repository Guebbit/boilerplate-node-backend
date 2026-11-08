---
source: src/modules/account/tests/integration/auth-hardening.test.ts
sha256: aeae567ad6d42d5def4023fec0624deda476b370b933bfd7ecfa84e378ea3dc9
generated_at: 2026-11-08T04:34:06.390793+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-hardening.test.ts

## Purpose

Integration tests for the two hardening layers on credential endpoints: the per-identity / per-address / per-block rate limiters and the antibot challenge gate. It verifies that guessing is bounded at each bucket independently, that successful logins never consume budget, and that the challenge gate arms at the correct threshold (half the identity budget spent, or a block-level budget exhausted). It exists as a module-local suite because the properties under test are owned by `account/rate-limits.ts`, not by the global error handler.

## Key elements

- **`limitersWithBudget(identityLimit, addressLimit?)`** — Returns freshly-constructed `credentialLimiters` with configurable budgets via a reloaded `rate-limits` module. Used in the "separately" describe block where the two buckets must be set independently.
- **`appWithBudget(identityLimit)`** — Builds a minimal Express app whose `/login` route mounts both `credentialLimiters` and `loginChallengeGate` from the *same* reload, so the gate's internal property-name lookup resolves to the limiter actually in use.
- **`describe('credential endpoints are rate limited separately')`** — Four tests: 429 after budget exhaustion, 200s never count against the budget, per-identity isolation at a shared address, and a smoke check that the limiter is mounted on the real `POST /account/login` route (verified via the `ratelimit` response header).
- **`describe('loginChallengeGate — rung 3 on the block budget too')`** — Verifies that spreading one failed guess across many accounts from a single /24 block arms the gate (403 + `ANTIBOT_VERIFICATION_FAILED`) even when no per-identity or per-address budget is touched.
- **`describe('loginChallengeGate — rung 3 only once the identity budget is mostly spent')`** — Three tests covering the no-provider short-circuit, the honest-first-attempt passthrough, and the exact half-budget threshold (2 failures of 4) at which the gate returns 403.

## Relationships

- **`src/modules/account/rate-limits.ts`** — The system under test. Imported dynamically inside `withReloadedRateLimits` so each test gets a fresh module instance with injected env budgets.
- **`tests/support/rate-limit-harness.ts`** — Provides `withReloadedRateLimits`, which sets process-env values, resets the module registry, re-imports `rate-limits`, and returns the requested export. Central to keeping budgets per-test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at the top level to seed the test database (needed by `createUser` and the real-route smoke test).
- **`src/modules/users/tests/factories.ts`** — Supplies `createUser` and `PLAIN_PASSWORD` for the one test that exercises the actual `/account/login` endpoint.
- **`tests/support/http.ts`** — Provides the `api()` helper (a pre-configured supertest agent) used only in the "mounted on the real login route" test.
- **`tests/support/environment.ts`** — `setEnvironment` swaps `NODE_ANTIBOT_PROVIDER` (and related vars) per test so the challenge gate can be exercised with or without a provider.

## Notes

- Every `describe` block ends with `jest.resetModules()` in `afterEach`; without it the reloaded `rate-limits` module would leak state between tests.
- The file deliberately tests against trivial inline handlers (401/200 JSON) rather than the real `postLogin` controller, so assertions isolate limiter/gate behavior from application logic. Only the final "mounted on the real login route" test hits the full stack.
- `limitersWithBudget` and `appWithBudget` exist separately because the gate reads a property name set on the limiter at construction time; a second reload would produce a gate pointing at a limiter nobody is spending. They cannot be merged.
- The `401` returned by the stub handler is intentional: the limiter counts 4xx responses as "failures" for budget purposes.
