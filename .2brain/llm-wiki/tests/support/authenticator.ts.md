---
source: tests/support/authenticator.ts
sha256: 4e5556985e7f54b6b2e9a95d0e0faf1d1514898c32952cb57340938050c9cb65
generated_at: 2026-11-08T09:51:22.701984+00:00
model: ollama:qwen3.8:27b
---

# tests/support/authenticator.ts

## Purpose

Test-support helper that arms a TOTP authenticator app on a staff test account and answers the resulting login challenge. Because a staff role grants no access until an authenticator is enrolled (`callerInScope`), every suite that signs in a staff-role account needs a pre-armed TOTP method and a way to produce a valid code on the second step.

## Key elements

- **`TEST_AUTHENTICATOR_SECRET`** — Fixed base32 secret (160 bits, RFC 4226) shared by all test authenticators. Exported so callers can reference it directly.
- **`armAuthenticator(userId, secret?)`** — Writes a `totp` entry into the account's `twoFactorMethods` array (encrypted secret under the entry's own `_id`) and persists via `userService.persistTwoFactorWrite`. Throws if the account is not found.
- **`armStaffAuthenticator(email)`** — Convenience wrapper: looks up the account by email, skips if already armed, checks that the account holds a staff role (tenant or platform) via `accessService.rolesOf`, and calls `armAuthenticator`. Returns `true`/`false` indicating whether it armed (or already found) an authenticator.
- **`withLoginCode<T>(email, spend)`** — Generates a TOTP code for the current 30-second step via `codeFor`, hands it to the `spend` callback (which runs the login's second step), then `$unset`s `lastUsedStep` on every `twoFactorMethods` entry so the same step can be reused on a subsequent sign-in.

## Relationships

- **`src/modules/users/index.ts`** (`userService`) — Used for `findByIdWithCredentials` and `persistTwoFactorWrite` in `armAuthenticator`.
- **`src/modules/users/repository.ts`** (`userRepository`) — Used for `findOne` (in `armStaffAuthenticator`) and `updateMany` (in `withLoginCode`).
- **`src/modules/users/tests/factories.ts`** — Source of the `userRepository` import.
- **`src/modules/access/index.ts`** (`accessService`) — `armStaffAuthenticator` calls `rolesOf` to confirm the account actually holds a staff role before arming.
- **`src/kernel/access/tenant.ts`** — Provides `DEPLOYMENT_TENANT_ID` passed to `accessService.rolesOf`.
- **`src/modules/account/two-factor/totp.ts`** — `encryptTotpSecret` encrypts the base32 secret under the entry id before it is stored.
- **`tests/support/totp.ts`** (`codeFor`) — Produces the 6-digit TOTP code from the shared secret and step 0.
- **`tests/integration/staff-second-factor.test.ts`**, **`src/modules/api-keys/tests/integration/api-keys.test.ts`** — Consumer suites that import these helpers to arm and sign in staff accounts.

## Notes

- `withLoginCode` always uses **step 0** (`codeFor(secret, 0)`), not the current time-based step. This means it is only valid while the real clock is within the first 30-second window after the secret is "created" in wall-clock terms; in practice the test process starts fresh enough that this works, but it is fragile if a suite runs long.
- The `$unset` of `lastUsedStep` after each sign-in is what allows a suite to sign in the *same* account multiple times within one 30-second TOTP window; without it the server's replay protection would reject the second attempt.
- `armStaffAuthenticator` silently returns `false` for non-staff accounts rather than throwing — callers must check the boolean if arming is a precondition.
- The secret is encrypted with the *entry's* `_id` (a freshly generated `ObjectId`), not the user id. The entry id is therefore the key to decrypting the secret on the server side.
