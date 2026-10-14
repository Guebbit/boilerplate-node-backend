---
source: src/modules/account/tests/contract/oauth.contract.test.ts
sha256: ea1251f33915f9f3f233a4ecc104290abf592b9ad61a66a209610bc592c4d0dd
generated_at: 2026-10-14T09:04:54.510402+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/oauth.contract.test.ts

## Purpose

Contract tests for the OAuth surface: the provider list endpoint, the start-redirect (with CSRF/PKCE cookie issuance), and the full callback round trip. Exercises real routes, real cookies, and a real database against a `fake` provider so the behaviour is pinned independent of any live IdP.

## Key elements

- **`beforeAll` → `registerOAuthProvider('fake', …)`** – Seeds the in-memory provider registry with `fakeOAuthProvider`; production never does this, so the suite must.
- **`attemptCookies(start)`** – Extracts the `oauth_state` and `oauth_verifier` set-cookie values from a start response into a single `Cookie` header string for the callback request.
- **`describe('GET /account/oauth/providers')`** – Asserts the fake provider appears in the list after registration.
- **`describe('GET /account/oauth/:provider')`** – Covers 404 for unknown providers, 302 redirect with state/verifier/continue/locale cookie issuance, and open-redirect rejection for malformed `continue`/`locale` values.
- **`describe('GET /account/oauth/:provider/callback')`** – Covers 404, missing/mismatched state, missing verifier (fail-closed before token exchange), successful round trip (session cookies, user creation, `verifiedAt`), continue/locale propagation + cookie clearing, forged-cookie rejection, and idempotent re-login (same user, not a duplicate).
- **`fakeLogin(continueTo?)`** – Helper that performs one full start → callback round trip; used by the "no continue" and "forged continue" tests.

## Relationships

- **`scenarios/support/doubles/oauth-fake.ts`** – Supplies `fakeOAuthProvider`, the stand-in IdP whose token endpoint is called during the callback.
- **`src/modules/account/oauth/providers/index.ts`** – `registerOAuthProvider` is called in `beforeAll` to make the fake provider discoverable by the routes.
- **`src/modules/account/tests/contract/support.ts`** – Provides `claimedAmr` (imported; likely used in assertions on auth context after login).
- **`src/modules/users/repository.ts`** – `userRepository` is queried to verify user creation, verification timestamp, and idempotency.
- **`src/modules/users/tests/factories.ts`** – User factory utilities for repository assertions.
- **`tests/support/contract.ts`** – Global contract-test setup (likely supertest wiring, app instance).
- **`tests/support/cookies.ts`** – `setCookie` (parse response cookies) and `cookieHeader` (build a request `Cookie` header).
- **`tests/support/http.ts`** – `api` (HTTP client bound to the test server) and `bearerForCookie` (token-from-cookie helper).
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises and tears down the test database.
- **`tests/support/totp.ts`** – `codeFor` generates TOTP codes (imported here, possibly for auxiliary auth assertions).

## Notes

- The fake provider is **not** present in production seeds; the suite registers it itself in `beforeAll`. Running this file without that registration will 404 on every OAuth route.
- Both `oauth_state` **and** `oauth_verifier` cookies are required at callback; sending only one must yield 400 (PKCE fail-closed).
- `continue` and `locale` cookies are re-validated at callback time, not trusted by name — the tests explicitly forge these cookies to confirm rejection.
- The idempotency test loops **sequentially** on purpose; a concurrent variant would test a race, not the documented behaviour.
- Admin-audit coverage for OAuth login paths is delegated to `login-paths.contract.test.ts` (noted in a trailing comment).
