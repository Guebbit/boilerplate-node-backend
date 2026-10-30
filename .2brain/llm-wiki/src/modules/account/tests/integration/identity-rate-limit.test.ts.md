---
source: src/modules/account/tests/integration/identity-rate-limit.test.ts
sha256: d0fc956c5b0316a51344a91c8e5629f69a8040091708ef941137f1930e7f3e29
generated_at: 2026-10-29T02:55:49.427233+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/identity-rate-limit.test.ts

## Purpose

Integration tests for the account module's rate limiters (`sessionCredentialLimiters`, `credentialLimiters`, `signupLimiters`, `resetRequestLimiters`), verifying their multi-dimensional budgets: per-identity (submitted email / authenticated account), per-address, and per-address-block (IPv4 /24, IPv6 /48). Tests are built against trivial handlers rather than real endpoints, because the property under test belongs to the limiter middleware itself.

## Key elements

- **`withAccountRateLimits`** — local helper wrapping `withReloadedRateLimits` with the account `rate-limits` module path baked in; accepts env-var overrides and a picker function to extract a specific limiter array.
- **`asAccount`** — Express `RequestHandler` stub that reads an `x-test-account` header and attaches an `AuthContext` stub to `request.authContext`, mimicking real `isAuth` behavior for tests that need an authenticated caller.
- **`sessionCredentialLimiters on an authenticated route`** — verifies the per-account budget is shared across different /24 blocks (the identity key, not the address key, is exhausted).
- **`credentialLimiters on a public route`** — four cases: victim-keyed budget for signed-in callers guessing another account's password; requests naming no account (absent or blank email) do not consume identity budget; unauthenticated attempts still key on the named email.
- **`signupLimiters`** — identity budget is spent on successful (201) signups (unlike credential limiters which only count failures); address budget caps distinct emails from one source.
- **`resetRequestLimiters`** — identity budget is spent on every 200 response (the indistinguishable-response design means the limiter cannot distinguish real from nonexistent accounts).
- **`address-block keying`** — confirms shared budget across different IPs within the same IPv4 /24 and same IPv6 /48, with separate budgets for different blocks.

## Relationships

- **`src/modules/account/rate-limits.ts`** — the module under test; its exported limiter arrays are the objects being asserted against.
- **`tests/support/rate-limit-harness.ts`** — provides `appAnswering` (builds a minimal Express app with a fixed status), `statusOf` (runs a supertest call and returns the status code), and `withReloadedRateLimits` (dynamically re-imports the rate-limits module with env overrides).
- **`tests/support/stub.ts`** — provides `asStub` used by the `asAccount` handler to fabricate an `AuthContext`.
- **`src/types/auth-context.ts`** — supplies the `AuthContext` type used in the `asAccount` stub.
- **`src/types/index.ts`** — barrel for the `@types` namespace import.
- **`tests/support/http.ts`** — provides `api` (likely used in the truncated portion for higher-level HTTP helpers).
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` (likely used in the truncated portion for DB-backed cases).
- **`src/modules/users/tests/factories.ts`** — provides `createUser` and `PLAIN_PASSWORD` (imported; likely used in the truncated portion).

## Notes

- Every `describe` block calls `jest.resetModules()` in `afterEach`; this is required because `withReloadedRateLimits` re-imports the rate-limits module with fresh env values. Omitting the reset causes stale limiter instances.
- The tests intentionally avoid real handlers (`postSignup`, `postResetRequest`, `postLogin`) — the comment block at the top explains this is by design and mirrors `submissionLimiter`'s own tests. The `tickets` module's analogous test lives at `src/modules/tickets/tests/integration/contact-identity-rate-limit.test.ts`.
- Rate-limit env vars are prefixed per endpoint: `NODE_AUTH_RATE_LIMIT_*`, `NODE_SIGNUP_RATE_LIMIT_*`, `NODE_RESET_RATE_LIMIT_*`. Setting a dimension to `'50'` effectively disables that axis for a given case so only the dimension under test is exercised.
- `skipSuccessfulRequests` (the second arg to `appAnswering`) controls whether successful responses consume budget — `true` for credential limiters (only 401s count), `true` for signup/reset (all responses count because the status is the same regardless of success/failure).
