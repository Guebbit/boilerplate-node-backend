---
source: src/modules/account/two-factor/methods/totp.ts
source_sha256: 6be4773e2700d03a76ab74aee68d6fcccb0f7134dcddb9f77067a0ed1058cd81
context_sha256: 898ba0a98d04bbd1d64dd5fec6e7047b20c46ed9dd3b85b575ceaf70142ad1e9
generated_at: 2026-11-22T04:11:39.749423+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/two-factor/methods/totp.ts

## Purpose
Registry adapter that exposes TOTP (authenticator-app) two-factor as a `TwoFactorMethodHandler`. It is a "device" method: nothing is delivered to the user. Its job is to mint a secret at setup and verify the six-digit codes derived from it. The actual crypto lives in the sibling module `src/modules/account/two-factor/totp.ts`.

## Key elements
- `totpMethod` (export): the handler, with `name: 'totp'` and `delivers: false`.
  - `available()` always returns `true`, and `eligibility()` always returns `{ enrollable: true }`. No channel or account property is required.
  - `target()` returns `undefined`, since there is nothing to send to.
  - `setup(user, entry)`:
    - Generates a fresh base32 secret with otplib's `generateSecret`.
    - Stores it encrypted on `entry.secret`, with the entry's `_id` (as a string) passed to `encryptTotpSecret`.
    - Clears `entry.lastUsedStep` to reset the replay window.
    - Resolves with `{ method: 'totp', delivers: false, secret, otpauthUri }`, where the URI is built from the secret and the user's email.
  - `verify(user, entry, code)`:
    - Returns `false` if the entry has no secret.
    - Decrypts the secret and calls `verifyTotpCode` with the code and `entry.lastUsedStep`.
    - On a valid result, claims the time step through `accountUserService.claimTotpStep`.
    - If the claim succeeds, it updates `entry.lastUsedStep` in memory and returns `true`.

## Relationships
- `src/modules/account/two-factor/registry.ts`: supplies the `TwoFactorMethodHandler` type that `totpMethod` implements.
- `src/modules/account/two-factor/totp.ts`: provides `buildOtpauthUri`, `encryptTotpSecret`, `decryptTotpSecret` and `verifyTotpCode`. All crypto and code-checking is delegated there.
- `src/modules/users/friends/account.ts` (`accountUserService`): `claimTotpStep` does the persistent replay-protection write.

## Notes
- Replay protection is a conditional write: only a later time step wins. If two requests carry the same code, one claim fails and is treated as a wrong code.
- The encryption call is keyed to the entry's `_id`, and decryption must use the same id.
- `setup` resets `lastUsedStep` because the old high-water mark belongs to a replaced secret. Keeping it would reject the first valid code.
- `verifyTotpCode` is expected to return `timeStep` whenever `valid` is true. The code checks for `undefined` only because the type does not guarantee it.
- A comment states that the entry's `_id` already exists when `setup` runs, because the enrollment code pushes the entry first.
