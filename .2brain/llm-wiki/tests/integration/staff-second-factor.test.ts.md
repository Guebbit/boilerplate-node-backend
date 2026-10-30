---
source: tests/integration/staff-second-factor.test.ts
sha256: 56385e35c827e81efe22aede456d3d7b5de007099f55cff1ab978c5346d98846
generated_at: 2026-10-29T07:04:06.384445+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/staff-second-factor.test.ts

## Purpose

Integration tests for the "staff role requires an authenticator app" gate. Verifies that a staff-role user (manager, operator) receives a distinct `SECOND_FACTOR_ENROLLMENT_REQUIRED` 403 on protected endpoints until a TOTP app is enrolled, that enrollment unlocks access on the very next request, and that disabling the app retroactively revokes API keys minted under that role.

## Key elements

- **`unarmedStaff(role, email)`** – helper that creates a verified user with a staff role, logs in via `/account/login`, and returns `{ user, bearer }`.
- **`managerWithKey()`** – helper that creates an armed manager, mints a 7-day API key scoped to `display:Order`, and returns `{ user, bearer, secret }`.
- **`describe('a staff role without an authenticator app')`** – six cases: 403 with enrollment code vs. plain `FORBIDDEN` for non-role rules; `secondFactorRequired: true` on `/account/abilities`; next-request gating when the role is granted post-login; same gate on the operator/platform door; and successful unlock after TOTP setup + confirm.
- **`describe('what counts as an authenticator app')`** – asserts that `armAuthenticator` sets `authenticatorEnabledAt` while an email 2FA method only sets `twoFactorEnabledAt`.
- **`describe('losing the authenticator app')`** – asserts that `POST /account/2fa/disable` revokes a previously minted key (after outbox settles), and that a key whose holder has been stripped of all 2FA fields resolves to no elevated permissions.

## Relationships

- **`@kernel/access/tenant`** – imports `DEPLOYMENT_TENANT_ID` to scope the API-key mint caller context.
- **`@kernel/outbox`** – calls `settleOutboxNudges()` to drain the async revocation message before asserting key state.
- **`@modules/api-keys/services/api-keys`** – imports `mint` to create a real API key in setup.
- **`@modules/users/tests/factories`** – imports `createUser`, `PLAIN_PASSWORD`, `userRepository` for user creation and direct row inspection.
- **`@modules/users`** – imports `userService` to read credentials and persist 2FA method writes.
- **`@modules/users/repository`** – imports `userRepository` for `$unset` of 2FA fields and `findById` assertions.
- **`@modules/access/tests/factories`** – imports `seedMembership` to grant tenant/platform roles.
- **`@tests/http`** – uses `api()` for all HTTP calls and `loginBearer` for bearer generation.
- **`@tests/authenticator`** – imports `armAuthenticator` (writes `authenticatorEnabledAt` + TOTP method) and `TEST_AUTHENTICATOR_SECRET` for code generation.
- **`@tests/totp`** – imports `codeFor` to produce valid TOTP codes for confirm/disable requests.
- **`@tests/credentials`** – imports `credentialOf` to resolve an API-key secret and inspect its caller permissions.
- **`@tests/session-epoch`** – calls `forgetSessionEpoch(bearer)` after TOTP enrollment invalidates the session.
- **`@tests/setup-test-db`** – calls `setupTestDb()` at module top-level to seed a clean database.

## Notes

- **Session invalidation on enrollment:** TOTP confirm ends the issuing session. The test calls `forgetSessionEpoch(bearer)` to reset the epoch guard so the *same* bearer token works on the next request (simulating a client token swap without re-login).
- **Outbox dependency:** Key revocation on 2FA disable is async via the outbox. Without `settleOutboxNudges()`, the `credentialOf` assertion would race the revocation.
- **`authenticatorEnabledAt` vs. `twoFactorEnabledAt`:** Only the former (set exclusively by TOTP app enrolment) triggers the staff gate. An email-2FA user still sees the enrollment-required 403.
- **`unrestricted: false`** on the mint caller context ensures the key inherits only the caller's explicit permissions, making the "customer-level ceiling" assertion meaningful.
