---
source: src/modules/account/tests/contract/oauth.contract.test.ts
sha256: 9c29d2a64a49047c9bc2aaa1a7aede0bba0b6b4951870ecf49316074bc3493ba
generated_at: 2026-09-23T18:12:48.940955+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/oauth.contract.test.ts

## Purpose

Contract tests for the OAuth surface (`GET /account/oauth/providers`, `GET /account/oauth/:provider`, and the full start → callback round-trip). They exercise the real routes, real CSRF/PKCE cookies, and a real database via the `fake` provider (enabled through `enableDemoProfile()`), mirroring what a Cypress spec would verify against a browser.

## Key elements

- **`attemptCookies(start)`** — Builds a `Cookie` request header carrying both `oauth_state` and `oauth_verifier` from a start response; both are required to redeem a callback.
- **`fakeLogin()`** — Convenience wrapper performing one complete start → callback round-trip through the fake provider.
- **`codeFor(secret, stepsFromNow = 1)`** — Generates a TOTP code for the _next_ RFC 6238 step (the "now" step is already consumed by the confirm request).
- **`describe('GET /account/oauth/providers')`** — Asserts the fake provider is listed under the demo profile.
- **`describe('GET /account/oauth/:provider')`** — 404 for unknown providers; 302 redirect to the callback URL with `oauth_state` and `oauth_verifier` cookies set.
- **`describe('GET /account/oauth/:provider/callback')`** — 404, 400 (missing/mismatched state), 400 (missing verifier), successful round-trip (session cookies, user created, redirect to frontend), idempotent second login, and admin-role audit correctness (regression B4).
- **`describe('…deactivated/deleted account (B24)')`** — Verifies a deactivated/deleted linked identity is refused: error redirect, no session cookie, no `AUTH_LOGIN` audit event.
- **`describe('…2FA armed (1b)')`** — Verifies the callback challenges for a TOTP code instead of minting a session, then mints one only after the code is answered.
- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces `emitAuditEvent` with a spy and re-routes `recordAudit` (which closes over its own module's reference) through the replacement so the spy sees every call.

## Relationships

- **`tests/support/contract.ts`** — Imported as a side-effect; provides shared contract-test setup (likely supertest wiring, global expectations).
- **`tests/support/http.ts`** — Supplies the `api()` HTTP client used for every request.
- **`tests/support/cookies.ts`** — Provides `setCookie` (extract a cookie from a response) and `cookieHeader` (build a `Cookie` header from response headers).
- **`tests/support/ports.ts`** — Provides `observePort`, used to attach a spy to `auditPort.emitAuditEvent` without breaking the mock.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the real test database before any test runs.
- **`src/infrastructure/runtime/demo-profile.ts`** — `enableDemoProfile()` / `enableDemoProfile(false)` toggles the fake OAuth provider for the duration of the suite.
- **`src/modules/users/tests/factories.ts`** — `createUser` and `userRepository` are used to pre-seed accounts and to assert on created/linked rows.
- **`src/modules/users/repository.ts`** — `userRepository.findOne` / `.count` / `.linkOAuthAccount` verify persistence side-effects.
- **`src/infrastructure/observability/audit.ts`** — Mocked; `emitAuditEvent` is spied on, `recordAudit` is re-routed to call the spy.
- **`src/modules/account/audit.ts`** — Exports `accountAuditActions` enum used to filter audit events by action name (`AUTH_LOGIN`, `AUTH_OAUTH_LINKED`, etc.).

## Notes

- The `recordAudit` mock must be re-routed explicitly because `recordAudit` closes over its _own_ module's `emitAuditEvent` binding; a simple property override on the module object would not be visible to it.
- `enableDemoProfile()` is toggled in `beforeAll`/`afterAll` to prevent the fake provider from leaking into other test suites.
- The TOTP helper defaults to `stepsFromNow = 1` because the confirm request already consumed the current 30-second window; replay protection rejects a repeated code.
- The second-login test (`toHaveLength(1)` on `userRepository.count`) is deliberately sequential, not concurrent — it tests idempotency, not race conditions.
- Bug-fix regressions B4 (admin role in audit) and B24 (deactivated account bypass) are encoded as dedicated test cases with explanatory comments referencing the original flaw.
