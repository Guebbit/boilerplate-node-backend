---
source: src/modules/account/tests/contract/login-paths.contract.test.ts
sha256: ea3fd119cd7a07751219b1ef3d4f056e39b8f7fc20813a77438c6f4496d49069
generated_at: 2026-11-14T19:00:18.923529+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/login-paths.contract.test.ts

## Purpose

Contract test that verifies invariants shared by **every** session-entry path (password, OAuth, and refresh/continuation) in one place instead of per-bug. It enforces two rules: (1) none of the paths may issue a session for a deactivated or soft-deleted account, and (2) password and OAuth login must audit the caller's real role and increment the shared `auth_login_total` metric exactly once. Refresh is deliberately excluded from rule 2 because it uses its own audit action and counter.

## Key elements

- **`LoginPath` interface** – Shape each path fills in: `name`, `attemptRefused`, `assertRefused`, optional `attemptSuccess` / `successStatus`. Drives the `describe.each` tables.
- **`passwordPath`** – Exercises `POST /account/login`; refusal expects 401, success expects 200.
- **`oauthPath`** – Exercises the fake-provider OAuth flow (start → callback); refusal expects a 302 redirect containing `error=` with no session cookies, success expects 302.
- **`continuationPath`** – Simulates a session already minted, then deactivates/deletes the account and attempts the next request (cookie-mode `GET /account` or jwt-mode `POST /account/refresh`). Name is dynamic via `getSessionMode()`.
- **`fakeLogin()`** – Performs a full start → callback round-trip through the `fake` OAuth provider.
- **`attemptCookies()`** – Extracts `__Host-oauth_state` and `__Host-oauth_verifier` cookies from the start response into a `Cookie` header.
- **`badState(kind)`** – Returns the document override (`{ active: false }` or `{ deletedAt: … }`) for a refused account.
- **`armed()` / `ARMED_ATTEMPTS`** – Sets up a 2FA-armed account and defines per-path attempt functions to verify all paths stop at the challenge (section truncated in source).
- **Refusal table** (`describe.each` × 3 paths × 2 states) – Asserts no session cookie is set and no `AUTH_LOGIN` with `outcome: 'success'` is audited.
- **Success table** (`describe.each` × 2 paths × 2 roles) – Asserts exactly one `AUTH_LOGIN` audit event with the correct `actorRole` mapping (admin→admin, customer→user) and one `authLoginTotal.inc({ status: 'success' })` call.

## Relationships

- **`tests/support/contract.ts`** – Imported for side-effects; configures the contract-test environment (timeout, retry, or reporting conventions).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` boots the in-memory test database before any test runs.
- **`tests/support/http.ts`** – Provides the `api()` supertest client used for every HTTP call.
- **`tests/support/cookies.ts`** – `setCookie` and `cookieHeader` parse/assert cookies on responses and build request headers.
- **`tests/support/ports.ts`** – `observePort` wraps a function into a jest mock; `auditPortMock` is the factory that fully replaces the audit module's exports (see Notes).
- **`src/infrastructure/observability/audit.ts`** – Its `emitAuditEvent` export is the function under observation; the test replaces the whole module so calls can be counted and inspected.
- **`src/modules/account/audit.ts`** – Supplies the `accountAuditActions` enum (`AUTH_LOGIN`, `AUTH_TOKEN_REFRESHED`, …) used in assertions.
- **`src/modules/account/metrics.ts`** – Supplies the `authLoginTotal` counter; spied on to assert the increment call.
- **`src/modules/account/session/config.ts`** – `getSessionMode()` determines whether the continuation path is "refresh" (jwt) or "the next request of a session" (cookie).
- **`src/modules/account/oauth/providers/index.ts`** – `registerOAuthProvider` registers the `fake` provider before the suite runs.
- **`scenarios/support/doubles/oauth-fake.ts`** – `fakeOAuthProvider` implements a deterministic OAuth provider returning `FAKE_OAUTH_EMAIL` / `FAKE_OAUTH_PROVIDER_ID`.
- **`src/modules/users/tests/factories.ts`** – `createUser` and `PLAIN_PASSWORD` create fixture accounts with the desired state and role; also provides the `userRepository` instance used to link OAuth identities and mutate account state mid-test.
- **`src/modules/users/repository.ts`** – Underlying repository that the factory-provided `userRepository` delegates to for OAuth linking and credential lookups.

## Notes

- **Module replacement, not spying**: The audit module is replaced wholesale via `tests/support/ports.ts`'s `auditPortMock` factory rather than using `jest.spyOn`, because CommonJS namespace imports expose exports as non-configurable getters that `spyOn` cannot redefine under all transforms this repo runs tests under.
- **Audit-spy clearing timing**: In the refusal tests the spy is cleared *after* any setup login (e.g. the refresh path's initial login) and *before* the call under test, so a legitimate setup `AUTH_LOGIN` is not mistaken for the refused attempt's audit.
- **Refusal ≠ no audit**: A refused attempt may still audit an `AUTH_LOGIN` with `outcome: 'failure'` (by design, to avoid leaking account state). The invariant is that no **success** outcome is recorded.
- **Role mapping**: `admin` membership maps to `actorRole: 'admin'`; `customer` maps to `actorRole: 'user'` in the audit event.
- **Dynamic test name**: `continuationPath.name` is computed from `getSessionMode()` at import time, so the describe title reads "refresh" or "the next request of a session" depending on configuration.
