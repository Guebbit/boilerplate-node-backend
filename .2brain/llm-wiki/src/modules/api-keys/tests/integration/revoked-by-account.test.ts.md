---
source: src/modules/api-keys/tests/integration/revoked-by-account.test.ts
source_sha256: c38fada96308a79ae18886831134017db3beb2be193193a5c6857597ab47553f
context_sha256: 491b75ac0c65634ca7fecc2f2a288a14505e66af3842b963e36597cb2cfb2133
generated_at: 2026-11-22T04:25:12.787583+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/tests/integration/revoked-by-account.test.ts

## Purpose
Integration test proving that the `account` module actually emits `account.sessions_revoked` at the points where the session epoch moves, and that the `api-keys` module reacts by revoking the keys the person minted. Flows are driven over HTTP. Event-handling logic itself is covered elsewhere (`api-keys.contract.test.ts`). The file also checks the cases where keys must survive.

## Key elements
- `setupTestDb()` and `apiKeysModule.onRegistered?.()` — prepare the test DB and install the credential resolver, as a real boot does once the module is enabled.
- `beforeEach` — sets `NODE_MAIL_TRANSPORT: 'log'` and `NODE_CORS_ORIGIN` to `FRONTEND`.
- `FRONTEND` — the single allowed origin (`https://shop.example`).
- `adminWithKey()` — helper that creates a verified admin user, builds a `TenantCallerContext` with the admin's permissions in `DEPLOYMENT_TENANT_ID`, and calls `mint` for a 7-day key with `read:WebhookSubscription`. It then logs in over HTTP. Returns `{ user, bearer, secret }`.
- Suite "keys end with the sessions that may be compromised":
  - `DELETE /account/sessions` (log out everywhere) revokes keys.
  - A completed password reset (`/account/password/reset/confirm`) revokes keys.
  - An email-change undo (`/account/email-change/undo`) revokes keys.
  - A replayed refresh token returns 401 and clears all session rows, but keys stay alive.
  - An ordinary password change (`POST /account/password`) leaves keys alive.
- Suite "keys wait out a scheduled account deletion": `DELETE /account` (202) makes the key unresolvable, and `/account/restore` makes it work again. The key is suspended, not revoked, and nothing is announced.

## Relationships
- `@tests/http` (`api`), `@tests/cookies` (`cookieHeader`), `@tests/setup-test-db`, `@tests/environment` (`setEnvironment`), `@tests/credentials` (`credentialOf`) — HTTP, cookie, DB, env and credential-lookup support. `credentialOf(secret)` is the assertion probe: defined means live, undefined means revoked or refused.
- `@modules/api-keys/module` — `onRegistered` installs the credential resolver.
- `@modules/api-keys/services/api-keys` — `mint` creates the key under test.
- `@modules/users/tests/factories` — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, plus `userRepository`, which the undo test uses to set `previousEmail`.
- `@modules/account/tests/factories` — `plantToken` (seeds password-reset, email-change-undo and account-restore tokens) and `sessionRowsOf`.
- `@kernel/outbox` — `settleOutboxNudges` waits for the relay to deliver the event after commit.
- `@kernel/access/tenant` (`DEPLOYMENT_TENANT_ID`), `@kernel/permissions` (`permissionsOfRole`), `@types` (`TenantCallerContext`) — build the caller context passed to `mint`.

## Notes
- Revocation is asynchronous via the outbox, so tests call `settleOutboxNudges()` before asserting.
- The replay test sets `NODE_TOKEN_ROTATION_GRACE_MS` to `'0'` so the stale refresh token is treated as theft rather than a second tab.
- Design rule encoded in the tests: keys belong to a deliberate act, not to a browser. Only logout-everywhere, a password reset or an email-change undo ends them. Refresh-token theft and an ordinary password change (where the owner proved the current password) do not.
