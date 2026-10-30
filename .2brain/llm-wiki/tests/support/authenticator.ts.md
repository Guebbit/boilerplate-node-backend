---
source: tests/support/authenticator.ts
sha256: 4e5556985e7f54b6b2e9a95d0e0faf1d1514898c32952cb57340938050c9cb65
generated_at: 2026-10-29T07:06:10.246502+00:00
model: ollama:qwen3.8:27b
---

# tests/support/authenticator.ts

## Purpose

Test-support utility for arming a TOTP authenticator app on a staff test account and answering the resulting second-factor login challenge. A staff role grants no access until an authenticator is armed (`callerInScope`), so every suite that signs in with a staff role needs a consistent, deterministic way to set that up and produce valid codes.

## Key elements

- **`TEST_AUTHENTICATOR_SECRET`** – Exported base32 constant (160 bits, RFC 4226 size) used as the default secret for every test authenticator.
- **`armAuthenticator(userId, secret?)`** – Pushes a single `totp` entry onto the user's `twoFactorMethods` array. The secret is encrypted under the entry's own `ObjectId` (matching production enrolment). Persists via `userService.persistTwoFactorWrite`. Throws if the user does not exist.
- **`armStaffAuthenticator(email)`** – Idempotent guard: looks up the user by email, and only calls `armAuthenticator` when the account holds a staff role (checked via `accessService.rolesOf`) and has no authenticator yet. Returns `false` for non-staff or missing accounts; `true` otherwise.
- **`withLoginCode<T>(email, spend)`** – Generates a TOTP code (step 0) with `codeFor`, hands it to the `spend` callback, then `$unset`s `twoFactorMethods.$[].lastUsedStep` so the same account can be signed in repeatedly within a single 30-second step (replay-protection workaround).

## Relationships

- **`@modules/users` (`src/modules/users/index.ts`)** – Uses `userService.findByIdWithCredentials` to load the user and `userService.persistTwoFactorWrite` to save the enrolment.
- **`@modules/users/tests/factories` (`src/modules/users/tests/factories.ts`)** – Uses `userRepository.findOne` (by email) in `armStaffAuthenticator` and `userRepository.updateMany` (clear `lastUsedStep`) in `withLoginCode`.
- **`@modules/access` (`src/modules/access/index.ts`)** – Uses `accessService.rolesOf` to check whether the account carries a staff role before arming.
- **`@modules/account/two-factor/totp` (`src/modules/account/two-factor/totp.ts`)** – Imports `encryptTotpSecret` so the stored secret matches the production encryption scheme (keyed by entry id).
- **`@kernel/access/tenant` (`src/kernel/access/tenant.ts`)** – Imports `DEPLOYMENT_TENANT_ID` as the tenant scope for the role lookup.
- **`tests/support/totp.ts`** – Imports `codeFor` to compute the one-time code that answers the login challenge.

## Notes

- The TOTP secret is encrypted under the **entry's own ObjectId**, not a global or user-level key. Tests that read the raw field will need the same per-id decryption.
- `withLoginCode` intentionally clears `lastUsedStep` after each use. Without this, a second login within the same 30-second window would be rejected by the replay guard even with a correct code.
- `armStaffAuthenticator` is safe to call unconditionally at suite setup: it is a no-op (returns `true`) if the account is already armed, and returns `false` for non-staff accounts without raising.
