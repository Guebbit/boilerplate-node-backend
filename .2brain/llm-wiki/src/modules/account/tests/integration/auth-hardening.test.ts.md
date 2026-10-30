---
source: src/modules/account/tests/integration/auth-hardening.test.ts
sha256: aeae567ad6d42d5def4023fec0624deda476b370b933bfd7ecfa84e378ea3dc9
generated_at: 2026-10-29T02:53:29.348762+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-hardening.test.ts

## Purpose

Integration tests for the credential-endpoint hardening layer defined in `account/rate-limits.ts`: verifies that per-identity and per-address rate-limit buckets behave independently, that successful logins don't consume budget, that the block-level budget arms the antibot challenge gate, and that the gate engages at the correct identity-budget threshold. Scoped to this module's limiters rather than the global error handler, which is covered by the root-level suite of the same name.

## Key elements

- **`limitersWithBudget(identityLimit, addressLimit?)`** — Returns freshly-constructed `credentialLimiters` via `withReloadedRateLimits`, with `NODE_AUTH_RATE_LIMIT_MAX` and `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` set to small values so individual buckets fill in a few requests.
- **`appWithBudget(identityLimit)`** — Returns an Express app wiring `credentialLimiters` **and** `loginChallengeGate` from a *single* reload, guaranteeing the gate reads the property name the limiter was configured with.
- **`describe('credential endpoints are rate limited separately')`** — Four cases: 429 after budget exhaustion, no spend on 2xx, independent identity budgets at a shared address, and confirmation the limiter is mounted on the real `/account/login` route (asserts the `ratelimit` response header is present).
- **`describe('loginChallengeGate — rung 3 on the block budget too')`** — Verifies the gate fires (403 + `ANTIBOT_VERIFICATION_FAILED`) when failures are spread across many accounts from one /24 block, with per-account and per-address budgets left at 100.
- **`describe('loginChallengeGate — rung 3 only once the identity budget is mostly spent')`** — Three cases: gate is inert with no provider selected, passes an honest first attempt through, and challenges at exactly half the identity budget spent.

## Relationships

- **`src/modules/account/rate-limits.ts`** — The module under test. Dynamically imported (with `jest.resetModules()` between cases) inside `withReloadedRateLimits` to obtain `credentialLimiters` and `loginChallengeGate` with specific env-var budgets.
- **`tests/support/rate-limit-harness.ts`** — `withReloadedRateLimits` provides the reload-and-configure mechanism that makes small budgets possible without mutating global state.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the database before the suite runs.
- **`tests/support/environment.ts`** — `setEnvironment` sets `NODE_ANTIBOT_PROVIDER` (or clears it) before each challenge-gate case.
- **`tests/support/http.ts`** — `api()` issues a request against the real application server for the "mounted on the real login route" case.
- **`src/modules/users/tests/factories.ts`** — `createUser` and `PLAIN_PASSWORD` supply a real credential for that same real-route test.

## Notes

- Every `describe` block calls `afterEach(() => jest.resetModules())`. Without this, the dynamic `import('@modules/account/rate-limits')` inside `withReloadedRateLimits` would return the cached (already-budgeted) module on the second call, silently reusing the first test's limiter.
- `limitersWithBudget` and `appWithBudget` exist separately because the gate reads a property name set by the limiter during construction; a second reload would hand the gate a limiter nobody is spending against. Any test that needs both must go through `appWithBudget`.
- The "mounted on the real login route" test does not assert a status code — it checks for the `ratelimit` response header, which is the limiter's observable fingerprint regardless of the downstream handler's outcome.
- The comment block at the top explains why this file lives under `src/modules/account/tests/` rather than alongside the root-level `tests/integration/auth-hardening.test.ts`: the latter tests the global error handler, through which *every* module's uncaught throw unwinds.
