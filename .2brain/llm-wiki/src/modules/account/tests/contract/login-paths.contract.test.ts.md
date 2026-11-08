---
source: src/modules/account/tests/contract/login-paths.contract.test.ts
sha256: 25bf47463155d054f41ded8d04fc234603d13551265aa7f8e608c7aa954cac56
generated_at: 2026-11-08T04:31:50.465687+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/login-paths.contract.test.ts

## Purpose
Contract test that verifies invariants shared by **every** session-entry point (password login, OAuth login, session continuation/refresh) are upheld: deactivated or soft-deleted accounts must never receive a session, and successful logins must audit the caller's real role and increment the shared `auth_login_total` metric. It exists so that a regression in one path (e.g. OAuth auditing the wrong role) is caught by the same table that covers password login, rather than by a per-path test added only after a bug is found.

## Key elements
- **`LoginPath`** – interface that each entry point implements: `name`, `attemptRefused`, `assertRefused`, optional `attemptSuccess` / `successStatus`. This is the unit of the `describe.each` tables.
- **`passwordPath`** – exercises `POST /account/login`; asserts 401 on refusal, 200 on success.
- **`oauthPath`** – exercises the `GET /account/oauth/fake` → callback round-trip via `fakeLogin()`; asserts 302 + `error=` redirect on refusal, 302 on success.
- **`continuationPath`** – exercises session continuation (refresh in JWT mode, next authenticated request in cookie mode); no success table entry by design.
- **`fakeLogin()`** – helper that performs the full start → callback OAuth flow against the registered `fake` provider.
- **`armed()` / `ARMED_ATTEMPTS`** – data for a second `describe.each` block verifying that every path stops at a 2FA challenge when an account has an armed TOTP method.
- **`jest.mock('@infrastructure/observability/audit', …)`** – replaces the audit port with `auditPortMock()` from `tests/support/ports.ts` (avoids `jest.spyOn` on a non-configurable CJS getter).
- **`beforeAll`** – registers the `fake` OAuth provider so the suite is self-contained.

## Relationships
- **`tests/support/contract.ts`** – imported as a side-effect (`import '@tests/contract'`); sets up contract-test conventions (likely global assertions or setup).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` resets the test database before the suite runs.
- **`tests/support/http.ts`** – provides `api()` (supertest agent) used for every HTTP call.
- **`tests/support/cookies.ts`** – `setCookie` / `cookieHeader` helpers for reading and forwarding CSRF/PKCE and session cookies.
- **`tests/support/ports.ts`** – `observePort` wraps a function into a spy; `auditPortMock` supplies the replacement audit module.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `PLAIN_PASSWORD`, `userRepository` for seeding accounts and linking OAuth identities.
- **`src/modules/account/oauth/providers/index.ts`** – `registerOAuthProvider` to install the fake provider.
- **`scenarios/support/doubles/oauth-fake.ts`** – `fakeOAuthProvider` that always returns a fixed email/subject.
- **`src/infrastructure/observability/audit.ts`** – the real audit port; mocked at module level, spied on via `observePort`.
- **`src/modules/account/audit.ts`** – `accountAuditActions` (enum of audit action strings like `AUTH_LOGIN`).
- **`src/modules/account/metrics.ts`** – `authLoginTotal` counter whose `.inc` is spied on to verify metric emission.
- **`src/modules/account/session/config.ts`** – `getSessionMode()` determines whether the continuation path exercises `/account/refresh` (JWT) or a plain authenticated GET (cookie).
- **`src/modules/users/repository.ts`** – `findByIdWithCredentials` / `save` used to mutate an account into a bad state *after* a session is minted.

## Notes
- **Refresh is deliberately absent from the success table.** It audits `AUTH_TOKEN_REFRESHED` and increments `auth_refresh_total`—a different contract. Including it would conflate two rules.
- **Audit spy is cleared *after* setup and *before* the call under test.** In the continuation path, a genuine login must occur first to produce a session; clearing the spy mid-test prevents that setup event from being mistaken for the refusal's audit.
- **Refusal does not mean zero audit events.** A refused password login still emits an `AUTH_LOGIN` failure (to avoid account-existence oracle). The invariant is specifically that no `outcome: 'success'` event appears.
- **Mock strategy is `jest.mock` (module replacement), not `jest.spyOn`.** The CommonJS namespace exposes exports as non-configurable getters, which `jest.spyOn` cannot redefine under this repo's transform pipeline.
- **`continuationPath.name` is dynamic**, derived from `getSessionMode()`, so the test title reads naturally regardless of the active session strategy.
- The file is truncated in the provided content; the 2FA/armed-account block (`ARMED_ATTEMPTS`) follows the same `describe.each` pattern and asserts that all paths halt at the challenge step.
