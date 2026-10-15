---
source: src/modules/account/tests/integration/identity-rate-limit.test.ts
sha256: 0539e9d75e407a4f6c9344dcbae52985dac356e322aab29d8636f8a86e660f77
generated_at: 2026-10-15T10:11:39.199037+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/identity-rate-limit.test.ts

## Purpose

Integration tests for the identity-, address-, and address-block-keyed rate limiters exported by the account module. Each test builds a trivial Express handler around the limiter under test (via `appAnswering`) so that the assertions verify the limiter's budgeting logic in isolation, not the business logic of `postSignup`, `postResetRequest`, or `postLogin`. The file covers all five limiter families in `rate-limits.ts`: `sessionCredentialLimiters`, `credentialLimiters`, `signupLimiters`, `resetRequestLimiters`, `mfaChallengeLimiter`, plus the IPv4 /24 and IPv6 /64 block-keying shared across them.

## Key elements

- **`withAccountRateLimits`** – Thin wrapper around `withReloadedRateLimits` that hard-codes the dynamic import of `@modules/account/rate-limits`; every test case calls this to get a limiter with specific env-var overrides.
- **`asAccount`** – Stub `RequestHandler` that reads the `x-test-account` request header and attaches it as `request.authContext` (via `asStub<AuthContext>`), standing in for the real token-based `isAuth` middleware.
- **`describe('sessionCredentialLimiters …')`** – Verifies that the per-account budget is shared across different /24 blocks, and that a second account from the same IP is unaffected.
- **`describe('credentialLimiters …')`** – Three cases: (a) a signed-in attacker's guesses count against the *victim's* account budget; (b) requests that name no account do not consume an identity budget (neighbouring /24 IPs stay unaffected); (c) an unauthenticated attempt is still keyed on the email it submits.
- **`describe('signupLimiters …')`** – Confirms successful (201) signups consume the identity budget (unlike credential limiters where only failures do), and that the address budget bounds distinct emails from the same caller.
- **`describe('resetRequestLimiters …')`** – Every 200 response (real or fake account) spends the identity budget, matching `postResetRequest`'s indistinguishable-response design.
- **`describe('address-block keying …')`** – Two cases proving that multiple IPv4 addresses in the same /24 share one block budget, and likewise for IPv6 /64; a different block gets its own budget.
- **`describe('mfaChallengeLimiter …')`** – Refuses the 6th guess against one challenge ID; keys OAuth continuations on the challenge cookie rather than identity.

## Relationships

- **`src/modules/account/rate-limits.ts`** – The module under test. Imported dynamically inside `withAccountRateLimits` so that `jest.resetModules()` in each `afterEach` forces a fresh module (and fresh limiter instances) per test.
- **`tests/support/rate-limit-harness.ts`** – Supplies `appAnswering`, `statusOf`, and `withReloadedRateLimits`; the harness builds the Express app with a fixed response status and wires the limiter middleware under test.
- **`tests/support/stub.ts`** – `asStub` is used by `asAccount` to create a minimal `AuthContext` object without the full user entity.
- **`src/types/auth-context.ts` / `src/types/index.ts`** – Provide the `AuthContext` type imported by `asAccount`.
- **`src/modules/users/tests/factories.ts`** – Imports `createUser` and `PLAIN_PASSWORD` (used in truncated portions for account setup).
- **`tests/support/http.ts`** – Provides the `api` helper for issuing supertest requests against the harness app.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` is imported for database isolation (used in truncated portions).

## Notes

- Every `afterEach` calls `jest.resetModules()` because `withAccountRateLimits` relies on a dynamic `import()`; without the reset, Jest's module cache would return the same (already-budget-spent) limiter on the next test.
- The tests deliberately use **trivial handlers** (a single status code) rather than real route handlers. The doc comment makes explicit that the property under test belongs to the limiter, not to `postSignup` / `postResetRequest`.
- `credentialLimiters` tests use a 401 response so that `skipSuccessfulRequests` is exercised; `signupLimiters` uses 201 to prove successful requests *do* consume budget. Do not swap the status codes without understanding which limiter semantics you're changing.
- The `asAccount` stub reads identity from a header (`x-test-account`), not from a real JWT. This means tests for `sessionCredentialLimiters` verify account-keying in isolation from token parsing.
- `mfaChallengeLimiter` is keyed on the `challenge` body field (or OAuth cookie), not on identity or address — it has only one budget dimension (`NODE_MFA_CHALLENGE_MAX`).
- The parallel test for `contactLimiters` lives in `src/modules/feedback/tests/integration/contact-identity-rate-limit.test.ts`; the two files are siblings in structure.
