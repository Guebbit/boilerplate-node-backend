---
source: src/modules/account/tests/integration/identity-rate-limit.test.ts
sha256: 078bb69a66f6765a88332f3b92f7f60101b6fa00edac49c7c515dafa01a3337f
generated_at: 2026-10-14T09:10:07.568433+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/identity-rate-limit.test.ts

## Purpose

Integration tests that verify the identity (submitted email / account id) and address-block (IPv4 /24, IPv6 /64) dimensions of the account module's rate limiters. Each limiter is exercised against a trivial handler (via the rate-limit harness) rather than a real route, because the property under test—budget keying—belongs to the limiter itself. The file covers "Anti-automation Rung 1" as described in `docs/tools/security.md`.

## Key elements

- **`withAccountRateLimits`** — Typed wrapper around `withReloadedRateLimits` that pre-binds the dynamic import of `@modules/account/rate-limits`, so every test case only supplies env overrides and a picker.
- **`asAccount`** — Stub Express middleware that populates `request.authContext` from an `x-test-account` header, standing in for the real `isAuth` middleware.
- **`describe('credentialLimiters on an authenticated route')`** — Asserts that an authenticated caller's budget is keyed on the *account* (not the address block) and that an unauthenticated attempt falls back to the email it names.
- **`describe('signupLimiters')`** — Asserts identity-budget spending on successful signups and cross-email address-budget enforcement from the same IP.
- **`describe('resetRequestLimiters')`** — Asserts the identity budget is consumed on the indistinguishable 200 response (every attempt counts).
- **`describe('address-block keying')`** — Verifies that distinct IPs within the same /24 (IPv4) or /64 (IPv6) share one block budget, while a different block gets a fresh one.
- **`describe('mfaChallengeLimiter')`** — Verifies per-challenge budgets, the OAuth cookie-based challenge key, and the fallback to the address-block key when no challenge is present.

## Relationships

- **`src/modules/account/rate-limits.ts`** — The module under test; each test dynamically imports it (via `withReloadedRateLimits`) to obtain `credentialLimiters`, `signupLimiters`, `resetRequestLimiters`, and `mfaChallengeLimiter`.
- **`tests/support/rate-limit-harness.ts`** — Provides `appAnswering` (builds an Express app with a fixed status response and the limiters), `statusOf` (fires a request and returns the status code), and `withReloadedRateLimits` (resets the module registry and re-imports with env overrides).
- **`tests/support/stub.ts`** — Provides `asStub`, used to fabricate a minimal `AuthContext` object for the `asAccount` middleware.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — Supply the `AuthContext` type used in the `asStub<AuthContext>` cast.
- **`src/modules/users/tests/factories.ts`** — Imports `createUser` and `PLAIN_PASSWORD` (available for auth-related fixtures; used in the truncated portion of the file).
- **`tests/support/http.ts`** — Exports `api` (app construction helper imported for potential use in fuller test scenarios).
- **`tests/support/setup-test-db.ts`** — Imports `setupTestDb`; relevant when tests need a clean database state.

## Notes

- Every `describe` block calls `jest.resetModules()` in `afterEach`; this is required because `withReloadedRateLimits` relies on a fresh module registry to pick up env-var overrides. Omitting it causes budget counters to leak between tests.
- The tests intentionally do **not** exercise real route handlers (`postSignup`, `postResetRequest`). They mount limiters on a dummy endpoint that returns a fixed status, isolating the keying logic.
- `feedback`'s `contactLimiters` share the same three-key shape; their tests live in `src/modules/feedback/tests/integration/contact-identity-rate-limit.test.ts` and are intentionally separate.
- The `mfaChallengeLimiter` "no challenge" case asserts the fallback key is the caller's *address block*, not a single shared key—protecting against two anonymous callers exhausting one bucket. See `challengeKey` in `account/rate-limits.ts`.
