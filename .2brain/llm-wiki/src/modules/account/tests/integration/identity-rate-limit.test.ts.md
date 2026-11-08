---
source: src/modules/account/tests/integration/identity-rate-limit.test.ts
sha256: d0d24f79bc1774a4af456c2b1d7424743936fef654b97b421217ed1ef2c4ce72
generated_at: 2026-11-08T04:36:54.243995+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/identity-rate-limit.test.ts

## Purpose

Integration tests for the account module's rate-limit limiters (`sessionCredentialLimiters`, `credentialLimiters`, `signupLimiters`, `resetRequestLimiters`), verifying that each limiter keys on three independent budget dimensions—per-account (submitted email), per-address, and per-address-block (IPv4 /24, IPv6 /48). Tests are built against trivial status-code-answering handlers rather than real route handlers, because the property under test (correct keying) belongs to the limiter, not to `postSignup`/`postResetRequest`.

## Key elements

- **`withAccountRateLimits`** — Thin wrapper around `withReloadedRateLimits` that hard-codes the `@modules/account/rate-limits` module import; accepts env-var overrides and a picker function.
- **`asAccount`** — A request-handler stub that reads the `x-test-account` header and attaches a stubbed `AuthContext` to `request.authContext`, mimicking the real `isAuth` middleware.
- **`describe('sessionCredentialLimiters …')`** — Asserts that a per-account budget (MAX = 2) is exhausted across *different* /24 blocks, while a different account from the same IP is unaffected.
- **`describe('credentialLimiters …')`** — Four cases: victim's budget spent (not attacker's) when a signed-in caller guesses another's password; absent email does not consume identity budget; blank email likewise; unauthenticated attempts still key on the named email.
- **`describe('signupLimiters')`** — Identity budget is spent on *successful* (201) signups (unlike credential limiters); address budget bounds distinct emails from one caller.
- **`describe('resetRequestLimiters')`** — Identity budget is consumed on the always-200 response, since `postResetRequest` is indistinguishable.
- **`describe('address-block keying')`** — IPv4 /24 and IPv6 /48 addresses share one block budget; a different /24 (or 3rd hextet for IPv6) gets a fresh budget.

## Relationships

- **`src/modules/account/rate-limits.ts`** — The module under test; each `withAccountRateLimits` call re-imports it with specific `NODE_*_RATE_LIMIT_*` env overrides and pulls out one limiter.
- **`tests/support/rate-limit-harness.ts`** — Supplies `appAnswering` (builds a trivial Express app that returns a fixed status), `statusOf` (extracts the response status), and `withReloadedRateLimits` (re-imports a module with env overrides).
- **`tests/support/stub.ts`** — Provides `asStub`, used by `asAccount` to fabricate the `AuthContext` object.
- **`src/types/auth-context.ts`** — Source of the `AuthContext` type that `asAccount` casts against.
- **`src/types/index.ts`** — Barrel re-export consumed via the `@types` alias.
- **`src/modules/users/tests/factories.ts`** — Exports `createUser` / `PLAIN_PASSWORD` (imported for use in the truncated portion of the file).
- **`tests/support/setup-test-db.ts`** — `setupTestDb` helper (imported; likely exercised in the truncated section).
- **`tests/support/http.ts`** — `api` helper (imported; likely used in the truncated section).

## Notes

- Every `describe` block calls `jest.resetModules()` in `afterEach`; this is required so that the next test's `withAccountRateLimits` re-import picks up its own env-var overrides.
- `X-Forwarded-For` is the convention for simulating client IP addresses; `x-test-account` is the test-only equivalent of a bearer-token identity.
- `credentialLimiters` and `sessionCredentialLimiters` respect `skipSuccessfulRequests` (only 401s count); `signupLimiters` and `resetRequestLimiters` count every request, including successes. The tests encode this distinction deliberately.
- The file's doc-block references `docs/tools/security.md` for the broader "identity-and-block-keyed budgets" security model and notes that `tasks/contactLimiters` has a parallel test at `src/modules/tasks/tests/integration/contact-identity-rate-limit.test.ts`.
