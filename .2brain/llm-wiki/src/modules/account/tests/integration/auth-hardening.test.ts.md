---
source: src/modules/account/tests/integration/auth-hardening.test.ts
sha256: d422997b4ba52876ca01e69a183fda3b1a1ccfe0b99fee01837d7d26cbc07937
generated_at: 2026-10-14T09:07:33.629558+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-hardening.test.ts

## Purpose

Integration tests for the credential-endpoint rate limiter and the antibot challenge gate defined in `account/rate-limits.ts`. Verifies that login endpoints get a smaller, separate budget from the global limiter, that successful attempts are exempt, that identity and address buckets constrain independently, and that the antibot gate engages only after the identity budget is at least half spent. This file is kept separate from the root-level `tests/integration/auth-hardening.test.ts` (which covers the global error handler) because the properties under test belong to this module's limiter, not to every module's uncaught-throw path.

## Key elements

- **`limitersWithBudget(identityLimit, addressLimit?)`** — Reloads `rate-limits.ts` with a small `NODE_AUTH_RATE_LIMIT_MAX` / `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` and returns only the `credentialLimiters` middleware array. Used for limiter-only tests where the two budgets need to differ.
- **`appWithBudget(identityLimit)`** — Builds a minimal Express app whose `/login` route is chained with `credentialLimiters` **and** `loginChallengeGate` from a *single* reload, so the gate and limiter share one module instance. Returns the app for supertest.
- **`describe('credential endpoints are rate limited separately')`** — Four tests: 429 after budget exhaustion; successful (200) attempts don't consume budget; per-identity budget is independent of per-address budget; limiter is actually mounted on the real `POST /account/login` route (verified via `ratelimit` response header).
- **`describe('loginChallengeGate — rung 3…')`** — Three tests: gate is inert when `NODE_ANTIBOT_PROVIDER` is unset; first honest attempt passes through when a provider is set; gate engages with `ANTIBOT_VERIFICATION_FAILED` once the identity budget is at least half spent.

## Relationships

- **`src/modules/account/rate-limits.ts`** — The module under test. Dynamically imported via `withReloadedRateLimits` to obtain `credentialLimiters` and `loginChallengeGate`.
- **`tests/support/rate-limit-harness.ts`** — Provides `withReloadedRateLimits`, which resets the module registry, sets env vars, re-imports `rate-limits.ts`, and returns the requested export.
- **`tests/support/environment.ts`** — `setEnvironment` toggles `NODE_ANTIBOT_PROVIDER` before each gate test.
- **`tests/support/http.ts`** — `api` builds a supertest agent for the single "mounted on real route" assertion.
- **`src/modules/users/tests/factories.ts`** — `createUser` / `PLAIN_PASSWORD` supply a valid user for that same real-route test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the database once at module top-level (required for the real-route test and any DB-touching factory call).

## Notes

- Every test block calls `afterEach(() => jest.resetModules())`; omitting it leaves a reloaded module cached and silently breaks subsequent reloads.
- The gate **must** come from the same reload as the limiters it reads from. `limitersWithBudget` deliberately returns only the limiters; reuse it with the gate and the gate will point at a limiter instance no one is actually spending.
- The two-bucket design is the security property: a single `email|ip` pair key would let an attacker rotate either half for a fresh bucket. The tests confirm both halves constrain independently.
- The "mounted on real route" test uses a real DB user but a trivial handler for the other limiter tests — the doc comment notes this avoids a database round-trip per attempt without changing what is being verified.
