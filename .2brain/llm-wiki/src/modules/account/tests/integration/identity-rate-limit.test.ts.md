---
source: src/modules/account/tests/integration/identity-rate-limit.test.ts
source_sha256: 49a0e69f76918dd67195154d728a293783f49f4541d944122b194b2b339c2a38
context_sha256: ab4eaec88bd6ce969e18c487df89c32b59d8bf660f829719c2f37493f867d206
generated_at: 2026-11-22T03:55:35.739627+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/identity-rate-limit.test.ts

## Purpose
Integration tests for the anti-automation "Rung 1" limiters in `@modules/account/rate-limits`. They check that `signupLimiters` and `resetRequestLimiters` enforce three keys (per-address, identity by submitted email, and address block: IPv4 /24 or IPv6 /48), and that `credentialLimiters` and `signedInCredentialLimiters` key on the account. The limiters run against trivial stub handlers, not the real `postSignup`/`postResetRequest`, because the behavior under test belongs to the limiter itself.

## Key elements
- `withAccountRateLimits(overrides, pick)`: wraps `withReloadedRateLimits`. It re-imports `@modules/account/rate-limits` with env overrides (e.g. `NODE_AUTH_RATE_LIMIT_MAX`, `NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX`) and returns the picked export.
- `asAccount`: a stand-in for `isAuth`. It sets `request.authContext` from the `x-test-account` header.
- `redirectingApp(failed, limiters)`: an Express app whose GET `/route` sets `request.credentialAttemptFailed` and answers 302. It models an OAuth callback.
- `smallAddressLimiters()`: `credentialLimiters` with the address budget at 2 and the other budgets raised out of the way.
- Test suites:
  - `signedInCredentialLimiters` on an authenticated route: one budget per account, even across different /24 blocks. Another account from an already-refused address is unaffected.
  - `credentialLimiters` on a public route:
    - A signed-in caller spends the budget of the account they name (the email in the body), not their own.
    - Requests with no email, or a blank one, are not counted.
    - An unauthenticated attempt is keyed on the email it names.
  - `credentialLimiters` and a redirecting failure: a 302 spends the address budget only when the handler flags `credentialAttemptFailed`. An unflagged redirect is refunded.
  - `signupLimiters`:
    - The identity budget is spent even on successful (201) signups, unlike `credentialLimiters`.
    - The address budget is spent across different emails from the same caller.
  - `resetRequestLimiters`: the identity budget counts the 200 that `postResetRequest` always returns, because the response is indistinguishable by design.
  - `address-block keying`: different IPv4 addresses in the same /24 share one block budget. The rest of this suite is not shown.

## Relationships
- `src/modules/account/rate-limits.ts`: the module under test. Its `credentialLimiters`, `signedInCredentialLimiters`, `signupLimiters` and `resetRequestLimiters` are loaded fresh for each case.
- `tests/support/rate-limit-harness.ts`: provides `appAnswering`, `statusOf` and `withReloadedRateLimits`, which build the stub apps, read status codes and reload the module with env overrides.
- `tests/support/stub.ts`: `asStub` casts a partial object to `AuthContext`.
- `src/types/auth-context.ts` and `src/types/index.ts`: supply the `AuthContext` type, imported via `@types`.
- `tests/support/http.ts`, `tests/support/setup-test-db.ts` and `src/modules/users/tests/factories.ts`: imported (`api`, `setupTestDb`, `createUser`, `PLAIN_PASSWORD`), but the visible part of the file doesn't use them.

## Notes
- Each `describe` calls `jest.resetModules()` in `afterEach`. Limiter state lives in module-level stores, so reloading with new env values is how counters are isolated between cases.
- Tests simulate client addresses with the `X-Forwarded-For` header and rely on the harness apps honoring it.
- The `401` responses used in these tests stand in for any refusal. Every status >= 400 spends a `skipSuccessfulRequests` budget.
- `appAnswering` is passed `true` as its second argument. The meaning isn't visible in this file.
