---
source: tests/integration/staff-second-factor.test.ts
sha256: 51c813205451b2456f4f05c18b9efb9c9c0a760245cd3c3a09c77d5b27449a67
generated_at: 2026-11-08T09:49:07.823053+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/staff-second-factor.test.ts

## Purpose

Integration test suite that verifies the "staff second-factor gate": a user holding a staff role (manager, editor, operator) cannot access staff-only endpoints until a TOTP authenticator app is enrolled. Once enrolled, the role unlocks on the next request; if the app is later disabled, any API keys minted under that staff identity are revoked. The suite also confirms that a mailed-code 2FA method does *not* satisfy the staff gate—only an authenticator app does.

## Key elements

- **`unarmedStaff(role, email?)`** – helper that creates a verified user with the given role, logs in via `POST /account/login`, and returns the user plus a bearer token.
- **`managerWithKey()`** – helper that creates an armed manager, mints an API key scoped to `display:Order`, and returns the user, bearer, and key secret for the revocation tests.
- **`describe('a staff role without an authenticator app', …)`** – asserts 403 + `SECOND_FACTOR_ENROLLMENT_REQUIRED` on staff endpoints, 200 on the customer `/account` endpoint (with `abilities.secondFactorRequired: true`), plain `FORBIDDEN` when the role's rule doesn't apply (editor), and the gate applying the moment a role is granted to a signed-in customer or to a platform operator.
- **`describe('what counts as an authenticator app', …)`** – verifies that only `armAuthenticator` sets `authenticatorEnabledAt`; an email 2FA method sets `twoFactorEnabledAt` but leaves `authenticatorEnabledAt` undefined.
- **`describe('losing the authenticator app', …)`** – after `POST /account/2fa/disable` + `settleOutboxNudges()`, the previously minted key no longer resolves (`credentialOf` returns undefined). A second test unsets the 2FA fields directly via `userRepository.updateMany` and confirms the key's resolved permissions drop to customer level.

## Relationships

- **`@kernel/access/tenant`** – supplies `DEPLOYMENT_TENANT_ID` for tenant-scoped membership seeding and key-mint caller context.
- **`@kernel/outbox`** – `settleOutboxNudges()` flushes the outbox so async credential-revocation nudges complete before assertions.
- **`@modules/access/tests/factories`** – `seedMembership` grants a role to a user for the "role granted to a signed-in customer" and "platform operator" cases.
- **`@modules/api-keys/services/api-keys`** – `mint` creates a real API key in the `managerWithKey` setup.
- **`@modules/users` / `@modules/users/services`** – `userService.findByIdWithCredentials` and `persistTwoFactorWrite` used to simulate an email-2FA user; `userRepository` for direct row inspection and the `$unset` revocation test.
- **`@modules/users/tests/factories`** – `createUser` and `PLAIN_PASSWORD` for every fixture.
- **`@tests/authenticator`** – `armAuthenticator` toggles the staff gate on; `TEST_AUTHENTICATOR_SECRET` is the TOTP secret used for the disable code.
- **`@tests/credentials`** – `credentialOf` resolves an API-key secret to check whether it is still active.
- **`@tests/http`** – `api()` (supertest wrapper) and `loginBearer` for HTTP calls.
- **`@tests/session-epoch`** – `forgetSessionEpoch` clears the in-test session store after enrollment (which ends the enrolling session).
- **`@tests/totp`** – `codeFor` generates a valid TOTP code for a given secret and time step.
- **`@tests/setup-test-db`** – `setupTestDb()` initialises an in-memory MongoDB for the whole file.

## Notes

- Enrolling a TOTP method **ends the current session**; the test calls `forgetSessionEpoch(bearer)` to mimic a client re-login before asserting the next request succeeds. Without this, the stale bearer would fail authentication.
- The revocation path is **asynchronous via the outbox**: after `POST /account/2fa/disable`, the test must call `settleOutboxNudges()` before `credentialOf` reflects the revocation.
- The "editor" case intentionally asserts a plain `FORBIDDEN` (not `SECOND_FACTOR_ENROLLMENT_REQUIRED`) to lock in that the 2FA gate only fires when the role's actual rule would have permitted access.
- `managerWithKey` mints the key with `unrestricted: false` and a single `display:Order` permission, so the "customer-level" assertion in the last test is a meaningful narrowing rather than an empty set.
