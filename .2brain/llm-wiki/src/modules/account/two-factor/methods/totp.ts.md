---
source: src/modules/account/two-factor/methods/totp.ts
sha256: 495b3d001fa0e2d4f4c910dc08b2f2f61664bdda3577733fb80bcd9af0f448eb
generated_at: 2026-11-08T04:52:49.016275+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/methods/totp.ts

## Purpose

Registry adapter for TOTP (time-based one-time password) two-factor authentication. It contains no crypto of its own; it wires the `TwoFactorMethodHandler` contract to the secret-generation, encryption, URI-building, and code-verification primitives that live in the sibling `../totp.ts` module.

## Key elements

- **`totpMethod`** (exported const) — A `TwoFactorMethodHandler` object with `name: 'totp'`, `delivers: false`. All handlers are unconditional: `available()` and `eligibility()` always return truthy.
  - **`setup(user, entry)`** — Generates a fresh base32 secret via `otplib.generateSecret()`, encrypts it with the entry's `_id`, clears `lastUsedStep`, and returns the plaintext secret plus an `otpauthUri` for QR-code onboarding.
  - **`verify(user, entry, code)`** — Decrypts the stored secret, checks the 6-digit code against it (respecting `lastUsedStep` for replay window), then atomically claims the time-step via `userService.claimTotpStep` so two concurrent requests carrying the same code cannot both succeed.

## Relationships

- **`../registry.ts`** — Supplies the `TwoFactorMethodHandler` type that `totpMethod` structurally satisfies.
- **`../totp.ts`** (sibling in `account/two-factor/`) — Provides `buildOtpauthUri`, `encryptTotpSecret`, `decryptTotpSecret`, and `verifyTotpCode`. All actual TOTP crypto lives there.
- **`@modules/users`** (`src/modules/users/index.ts`) — Re-exports `userService`, which this file uses for the atomic `claimTotpStep` write.
- **`src/modules/users/services/index.ts`** — Implied implementation home for `userService.claimTotpStep`; the conditional "later-step-wins" write that enforces replay protection.

## Notes

- This file is intentionally thin. If you need to change TOTP crypto, window size, or hashing, edit `../totp.ts`, not here.
- `entry._id` is assumed to exist by the time `setup`/`verify` run; the comment credits `two-factor-enrollment.ts` for pushing it first. Do not rely on `entry._id` in any earlier lifecycle stage.
- `lastUsedStep` is deliberately set to `undefined` on every new enrollment. Keeping the old high-water mark would reject the first valid code under the new secret.
- The replay guard is a *conditional* database write (only a strictly later `timeStep` wins), not a simple "set if different." The in-memory `entry.lastUsedStep` is updated only when the claim succeeds, so the caller's subsequent save persists the same value.
- `result.timeStep` is guaranteed present when `result.valid` is true, but the `otplib` type does not reflect that, hence the explicit `=== undefined` guard.
