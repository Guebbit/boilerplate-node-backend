---
source: src/modules/account/two-factor/methods/totp.ts
sha256: 495b3d001fa0e2d4f4c910dc08b2f2f61664bdda3577733fb80bcd9af0f448eb
generated_at: 2026-10-14T14:49:51.747705+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/methods/totp.ts

## Purpose

Registry adapter that exposes TOTP (authenticator-app) as a two-factor method. All cryptographic logic lives in the sibling `../totp.ts`; this file only wires the `setup` and `verify` lifecycle steps to the `TwoFactorMethodHandler` contract, adds per-enrollment secret encryption, and enforces single-use via a conditional step claim.

## Key elements

- **`totpMethod`** (exported `TwoFactorMethodHandler`) — the sole export.
  - `available` / `eligibility` — always true; no channel or property gate.
  - `target` — returns `undefined` (no delivery target; user reads the secret directly).
  - `setup` — mints a base32 secret via `otplib.generateSecret`, encrypts it keyed to the entry `_id`, clears `lastUsedStep`, and returns the plaintext secret plus an `otpauthUri`.
  - `verify` — decrypts the stored secret, delegates code validation to `verifyTotpCode`, then calls `userService.claimTotpStep` to atomically advance the high-water mark before reporting success.

## Relationships

- **`../registry.ts`** — provides the `TwoFactorMethodHandler` type that `totpMethod` implements.
- **`../totp.ts`** (sibling crypto module) — supplies `buildOtpauthUri`, `encryptTotpSecret`, `decryptTotpSecret`, and `verifyTotpCode`.
- **`@modules/users`** (`src/modules/users/index.ts`) — source of `userService`.
- **`src/modules/users/services/index.ts`** — implementation behind `userService.claimTotpStep`, the conditional-write primitive that guarantees a code can pass verification at most once.

## Notes

- The secret is encrypted at rest with the entry `_id` as the key; the plaintext secret is returned only during `setup` so the user can scan it into their app.
- `entry.lastUsedStep` is intentionally reset on every new enrollment; carrying a stale mark forward would reject the first valid code under the new secret.
- Replay protection relies on `claimTotpStep` being a conditional (compare-and-swap) write: only a *later* time-step wins, so two concurrent requests carrying the same code cannot both succeed.
- The `result.timeStep` is asserted non-undefined via a runtime check even though the `otplib` type does not guarantee it co-occurs with `valid`.
