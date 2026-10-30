---
source: src/modules/account/tests/contract/oauth.contract.test.ts
sha256: 1306ef6f186d58dfff907e61280c67b0a41120459136ffd4f95cc9c4161468d7
generated_at: 2026-10-29T02:51:57.320288+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/oauth.contract.test.ts

## Purpose

Contract tests for the OAuth surface (`GET /account/oauth/providers`, `GET /account/oauth/:provider`, `GET /account/oauth/:provider/callback`). Exercises the full start → callback round trip against the real routes, real CSRF/PKCE cookies, and a real database, using a locally registered `fake` provider that production would never seed. Mirrors the path a Cypress spec walks in a browser but at the HTTP level.

## Key elements

- **`unverifiedOAuthProvider`** — a thin wrapper over `fakeOAuthProvider` that overrides `exchangeCode` to return `emailVerified: false`, used to test the unverified-email error path.
- **`beforeAll`** — registers `fake` and `fake-unverified` via `registerOAuthProvider`; production seeds no such entries, so the suite must create them itself.
- **`attemptCookies(start)`** — helper that bundles the `__Host-oauth_state` and `__Host-oauth_verifier` cookies from a start response into a single `Cookie` header for the callback request.
- **`describe('GET /account/oauth/providers')`** — asserts the registered fake provider appears in the list.
- **`describe('GET /account/oauth/:provider')`** — verifies the 302 redirect, sets/clears of `__Host-oauth_state`, `__Host-oauth_verifier`, `__Host-oauth_continue`, `__Host-oauth_locale`; validates cookie attributes (Max-Age=300, HttpOnly, SameSite=Lax); rejects invalid `continue` and `locale` values.
- **`describe('GET /account/oauth/:provider/callback')`** — covers state mismatch, missing verifier (PKCE fail-closed), planted unprefixed cookies, successful round trip (session creation, user record with `termsAcceptedAt`), unverified email, banned/soft-deleted accounts, and `continue`/`locale` passthrough.
- **`fakeLogin`** (referenced in tests, likely defined lower in the file or in `./support`) — shorthand helper that performs start + callback in one call.
- **`setupTestDb()`** — real database per suite; `afterEach` restores real timers.

## Relationships

- **`scenarios/support/doubles/oauth-fake.ts`** — supplies `fakeOAuthProvider` (code exchange, token endpoint) used as the test double.
- **`src/modules/account/oauth/providers/index.ts`** — `registerOAuthProvider` is called in `beforeAll` to inject the fake providers into the route registry.
- **`src/modules/account/tests/contract/support.ts`** — provides `claimedAmr` (assertion helper for AMR values).
- **`src/modules/account/tests/factories.ts`** — provides `mintSession` for session-related assertions.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds pre-banned or soft-deleted accounts for error-path tests.
- **`src/modules/users/repository.ts`** — `userRepository` is queried after a successful callback to verify the created user record and to link an OAuth account before testing banned/deleted cases.
- **`tests/support/contract.ts`** — side-effect import enabling contract-test infrastructure (likely response shape assertions).
- **`tests/support/http.ts`** — `api()`, `bearerForCookie`, `staleBearerFor` supply the HTTP client and auth helpers.
- **`tests/support/cookies.ts`** — `setCookie` / `cookieHeader` parse and assemble `Set-Cookie` / `Cookie` headers for assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the real database for the suite.
- **`tests/support/totp.ts`** — `codeFor` (imported; likely used in a section below the truncation for TOTP-protected OAuth flows).

## Notes

- The suite registers its own providers in `beforeAll`; it does **not** rely on any production seed. Removing or reordering that block will silently break every test.
- PKCE verifier is a separate cookie from CSRF state. Tests explicitly assert that a missing verifier causes a 400 (fail-closed) rather than a silent token exchange.
- `__Host-` prefix is asserted on every OAuth cookie; tests for "planted unprefixed cookies" confirm sibling-host cookies are ignored.
- Banned and soft-deleted accounts both map to the generic `provider_error` query param so the caller cannot distinguish them.
- `locale` accepts only bare tags (e.g. `it`); URL-like values are silently dropped, not stored.
- The `continue` param must be a same-origin relative path; protocol-relative, absolute, and missing-slash forms are all rejected.
- The file is truncated in the sample shown; additional tests (e.g. TOTP-gated flows using `codeFor`, `claimedAmr` assertions) likely follow the `locale` passthrough test.
