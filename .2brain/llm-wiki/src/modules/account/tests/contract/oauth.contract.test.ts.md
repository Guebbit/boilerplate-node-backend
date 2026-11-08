---
source: src/modules/account/tests/contract/oauth.contract.test.ts
sha256: 7112538d7c099ebec5e64f09a3e96802fe6423cc38a1d2c40b7ea6ec51f125f2
generated_at: 2026-11-08T04:32:07.276037+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/oauth.contract.test.ts

## Purpose

Contract tests for the full OAuth start → callback round trip using a `fake` provider. Exercises the same path a Cypress spec walks against a real browser, but here against the real routes, real CSRF cookie, and a real database. Also covers the `GET /account/oauth/:provider` start endpoint's cookie-setting behavior, input validation, and security edge cases (Open Redirect, sibling-host cookie planting, PKCE fail-closed).

## Key elements

- **`unverifiedOAuthProvider`** — local variant of `fakeOAuthProvider` whose `exchangeCode` returns `emailVerified: false`; registered as `fake-unverified` to test the unverified-email rejection path.
- **`attemptCookies(start)`** — helper that extracts `__Host-oauth_state` and `__Host-oauth_verifier` from a start response and formats them as a single `Cookie` header for the callback request.
- **`beforeAll`** — registers both `fake` and `fake-unverified` via `registerOAuthProvider`; necessary because production seeding creates no such entry.
- **`describe('GET /account/oauth/:provider')`** — validates 404 for unknown providers, 302 redirect to `/callback`, cookie attributes (Max-Age=300, HttpOnly, SameSite=Lax), `continue` / `locale` cookie persistence, and rejection of invalid `continue` (protocol-relative, absolute URL, missing leading slash) or non-tag `locale` values.
- **`describe('GET /account/oauth/:provider/callback')`** — validates state/verifier matching, replay protection (cookie cleared on failure), sibling-host cookie rejection, PKCE fail-closed when verifier is absent, full successful login (session cookies, user creation, `termsAcceptedAt`, `__Host-device`), unverified-email rejection (`email_unverified`), banned/soft-deleted account masking (`provider_error`), and `continue`/`locale` carry-through + cookie clearing.

## Relationships

- **`scenarios/support/doubles/oauth-fake.ts`** — source of `fakeOAuthProvider`; the test spreads it to build `unverifiedOAuthProvider`.
- **`src/modules/account/oauth/providers/index.ts`** — provides `registerOAuthProvider`, called in `beforeAll` to make the fake providers discoverable by the routes.
- **`src/modules/account/tests/contract/support.ts`** — provides `claimedAmr` (used in truncated portion of the file).
- **`src/modules/account/tests/factories.ts`** — provides `mintSession` (used in truncated portion).
- **`src/modules/users/tests/factories.ts`** — provides `createUser` and `userRepository` for seeding banned/soft-deleted users and asserting on the created record.
- **`src/modules/users/repository.ts`** — `userRepository` is used to verify the user row after a successful callback and to link an OAuth account for negative-path tests.
- **`tests/support/contract.ts`** — imported for shared contract-test setup conventions.
- **`tests/support/cookies.ts`** — provides `setCookie` (assertion helper) and `cookieHeader` (request-builder helper).
- **`tests/support/http.ts`** — provides `api()` for HTTP calls; `bearerForCookie` and `staleBearerFor` imported for truncated section.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` called at module level to prepare the database.
- **`tests/support/totp.ts`** — provides `codeFor` (used in truncated portion).

## Notes

- The suite registers its own fake providers; it does **not** rely on any seed or dev preload, so the file is self-contained for CI.
- State and verifier cookies are both required on the callback (PKCE + CSRF). The test explicitly verifies that a missing verifier fails closed (400) rather than silently skipping the PKCE check.
- On **failed** state/verifier match the state cookie is still cleared (replay protection), asserted in multiple cases.
- Sibling-host attack is tested by sending **unprefixed** `oauth_state` / `oauth_verifier` cookies; the handler must ignore them.
- Banned (`active: false`) and soft-deleted (`deletedAt`) accounts both return the generic `provider_error` query param — the caller cannot distinguish the two states.
- Successful login sets `__Host-device` (same as the password path) but sets **no** `max-age`/`expires` on session cookies (browser-session only).
- `afterEach` restores real timers, implying at least one test in the (truncated) section uses fake timers.
