---
source: src/modules/account/tests/integration/identity-rate-limit.test.ts
sha256: 573d13d581b9e12a8a531253074d369e02f9b8e234430b20951845a54291c33c
generated_at: 2026-11-14T19:04:17.074875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/identity-rate-limit.test.ts

## Purpose

Integration tests for the account module's rate limiters, verifying the "identity and block-keyed budgets" design (Anti-automation Rung 1). Each limiter is tested against trivial Express handlers (fixed 401/200/201/302 responses) to isolate the keying logic—identity (email), address-block (/24, /48), and account dimensions—without coupling the assertions to `postSignup`, `postResetRequest`, or any other real route handler.

## Key elements

- **`withAccountRateLimits`** — Thin wrapper around `withReloadedRateLimits` that pins the module-under-test to `@modules/account/rate-limits`, so every test case shares the same import path.
- **`asAccount`** — A `RequestHandler` stub that reads an `x-test-account` header and attaches a minimal `AuthContext` to the request, standing in for real token-based auth.
- **`redirectingApp(failed, limiters)`** — Builds an Express app whose route responds 302 and sets `request.credentialAttemptFailed`; used to test that redirect-based failures (OAuth-callback pattern) spend or refund budget correctly.
- **`smallAddressLimiters()`** — Returns `credentialLimiters` with `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` set to 2, isolating the address dimension.
- **`describe` blocks** cover:
  - `signedInCredentialLimiters` — per-account budget shared across address blocks; separate accounts untouched.
  - `credentialLimiters` on public routes — budget keyed to the *named* victim email, not the attacker's session; blank/absent email does not create an identity key; unauthenticated attempts still key on the submitted email.
  - `credentialLimiters` + 302 redirects — budget spent only when `credentialAttemptFailed` is true; unflagged redirects are refunded.
  - `signupLimiters` — identity budget consumed on *successful* (201) signups; address budget bounds distinct emails from the same caller.
  - `resetRequestLimiters` — identity budget consumed on the uniform 200 response (indistinguishable-by-design).
  - `address-block keying` — shared budget across IPs within the same /24.

## Relationships

- **`src/modules/account/rate-limits.ts`** — The module under test. Tests dynamically import `signedInCredentialLimiters`, `credentialLimiters`, `signupLimiters`, and `resetRequestLimiters` from it.
- **`tests/support/rate-limit-harness.ts`** — Provides `appAnswering`, `statusOf`, and `withReloadedRateLimits`, the core test scaffolding for building limiter-equipped Express apps and asserting on response status.
- **`tests/support/stub.ts`** — Provides `asStub`, used by the `asAccount` middleware to create a minimal `AuthContext` object.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — Supply the `AuthContext` type used by the auth stub.
- **`tests/support/setup-test-db.ts`** — Imported for database lifecycle (called at the integration level); not visibly invoked in the shown cases but present for the integration context.
- **`src/modules/users/tests/factories.ts`** — Imported (`createUser`, `PLAIN_PASSWORD`); available for tests that need a real user record in the DB.
- **`tests/support/http.ts`** — Imported (`api`); available for HTTP-level setup in the integration harness.

## Notes

- Every `afterEach` calls `jest.resetModules()` so the next test gets a fresh in-memory limiter state—there is no cross-test leakage.
- Tests deliberately use **trivial handlers** (fixed status codes) rather than real routes. The file header explicitly states the property under test belongs to the limiter, not to `postSignup`/`postResetRequest`.
- `appAnswering` takes a boolean flag (always `true` here) that tells the harness whether to count the request as a "failure" for budget-spending purposes.
- The `credentialLimiters` tests distinguish three keying dimensions: **account** (the authenticated caller), **identity** (the email in the body), and **address-block** (IPv4 /24 or IPv6 /48). A request may spend one, two, or all three budgets depending on which fields are present.
- The 302-redirect tests (`redirectingApp`) verify that the limiter reads `request.credentialAttemptFailed` to decide whether a redirect is a real failure—critical for OAuth callbacks where a 302 can mean success *or* failure.
- A sibling test, `src/modules/tasks/tests/integration/contact-identity-rate-limit.test.ts`, covers the analogous `contactLimiters` budget for the tasks module.
