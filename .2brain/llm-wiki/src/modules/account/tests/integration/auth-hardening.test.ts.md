---
source: src/modules/account/tests/integration/auth-hardening.test.ts
sha256: 52bafbb6f98b117b68db9f62473214099c97f22627e232956ab9b938f1f74b79
generated_at: 2026-10-15T10:10:25.243736+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-hardening.test.ts

## Purpose

Integration tests for the credential-endpoint rate limiters and the antibot challenge gate as exported by `account/rate-limits.ts`. It verifies that per-identity and per-address budgets are independent, that only failed attempts spend budget, that the block-level budget triggers the challenge gate for credential-stuffing patterns, and that the gate engages only once the identity budget is at least half consumed (and only when an antibot provider is configured).

## Key elements

- **`limitersWithBudget(identityLimit, addressLimit?)`** — Returns freshly-constructed `credentialLimiters` with the given budgets, via a single `withReloadedRateLimits` call. Used by tests that only need the limiter middleware.
- **`appWithBudget(identityLimit)`** — Builds an Express app whose `/login` route wires both `credentialLimiters` and `loginChallengeGate` from **one** shared module reload. Required because the gate reads the property name the limiter was configured with; a second reload would hand back a gate pointing at a limiter nobody is spending.
- **`describe('credential endpoints are rate limited separately')`** — Four cases: 429 after budget exhaustion; successful (2xx) responses do not consume budget; per-identity budgets are independent of each other (one account at 429, another still at 401); and the limiter is actually mounted on the real `/account/login` route (checked via `ratelimit` response header).
- **`describe('loginChallengeGate — rung 3 on the block budget too')`** — Verifies that spreading one failure across many accounts from the same IP block arms the challenge gate (`ANTIBOT_VERIFICATION_FAILED`) even though no single identity or address budget is exhausted.
- **`describe('loginChallengeGate — rung 3 only once the identity budget is mostly spent')`** — Three cases: gate is inert when no provider is set; an honest first attempt passes through unchanged; gate fires on the failure that pushes the identity budget to ≥ 50 % spent.

## Relationships

- **`src/modules/account/rate-limits.ts`** — The SUT. Its `credentialLimiters` and `loginChallengeGate` are imported via dynamic `import()` inside each test so that `withReloadedRateLimits` can inject custom `NODE_AUTH_RATE_LIMIT_*` env values per case.
- **`tests/support/rate-limit-harness.ts`** — Provides `withReloadedRateLimits`, which sets env vars, force-reloads the target module, and returns the requested export.
- **`tests/support/setup-test-db.ts`** — Called once at module top level (`setupTestDb()`) to provision a clean test database before any suite runs.
- **`tests/support/http.ts`** — `api()` is used in the "mounted on the real login route" case to hit the full application (not the isolated Express app).
- **`src/modules/users/tests/factories.ts`** — `createUser` and `PLAIN_PASSWORD` supply a real user for that same "mounted on the real route" case.
- **`tests/support/environment.ts`** — `setEnvironment` configures `NODE_ANTIBOT_PROVIDER` (`'turnstile'` or `undefined`) before each challenge-gate test.

## Notes

- Every `describe` block calls `jest.resetModules()` in `afterEach`; this is what makes the next `withReloadedRateLimits` call pick up a fresh module instance rather than a cached one. Omitting it silently reuses the previous budget.
- The file's doc comment explicitly separates its scope from the root-level `tests/integration/auth-hardening.test.ts` (the global error-handler suite). Do not move the "uncaught throw unwinds through the root handler" assertions into this file.
- `limitersWithBudget` and `appWithBudget` exist separately **on purpose**: reusing the former inside the latter would trigger a second module reload and break the gate's reference to the limiter's configured property name.
- The "mounted on the real route" test is the only case that hits the full application via `api()`; all other cases use a bare `express()` app to isolate the limiter/gate behavior from routing and controller logic.
