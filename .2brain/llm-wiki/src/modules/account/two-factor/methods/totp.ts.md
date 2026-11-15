---
source: src/modules/account/two-factor/methods/totp.ts
sha256: 5a3f230e77cbb7a5e10328f3461a184162fab8cb37c2c9910da081315f8aee37
generated_at: 2026-11-14T19:18:14.172556+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/methods/totp.ts

## Purpose

Registry adapter for the TOTP two-factor method. It exposes a `TwoFactorMethodHandler` object whose `setup` mints an encrypted TOTP secret and whose `verify` checks a six-digit code against it. All cryptographic work is delegated to the sibling `../totp.ts`; this file only wires the handler into the registry contract.

## Key elements

- **`totpMethod`** (exported const) — the sole export; a `TwoFactorMethodHandler` object:
  - `setup(user, entry)` — generates a base32 secret via `otplib`, encrypts it with the entry's `_id`, resets `lastUsedStep` to `undefined`, and returns the plaintext secret plus an `otpauthUri` for the user's authenticator app.
  - `verify(user, entry, code)` — decrypts the stored secret, calls `verifyTotpCode`, then calls `accountUserService.claimTotpStep` to record the winning time-step and returns the boolean result.
  - `delivers: false`, `available: () => true`, `eligibility: () => ({ enrollable: true })`, `target: () => undefined` — TOTP is universally available, requires no delivery channel, and needs no account property to prove.

## Relationships

- **`../registry`** (`src/modules/account/two-factor/registry.ts`) — provides the `TwoFactorMethodHandler` type that `totpMethod` structurally satisfies.
- **`../totp`** (`src/modules/account/two-factor/totp.ts`) — supplies the four helpers (`buildOtpauthUri`, `decryptTotpSecret`, `encryptTotpSecret`, `verifyTotpCode`) used by both `setup` and `verify`.
- **`src/modules/users/friends/account.ts`** — this file imports `accountUserService` from it and calls `claimTotpStep(user.id, entry.method, timeStep)` during verification; the returned boolean gates whether the code is accepted.

## Notes

- The encryption key is `String(entry._id)`, so the subdocument's `_id` must exist before `setup` runs; the comment notes that `two-factor-enrollment.ts` pushes it first.
- `lastUsedStep` is intentionally cleared on every new enrollment because the old high-water mark belongs to a discarded secret; keeping it would reject the first valid code.
- The replay guard relies on `claimTotpStep` as a conditional write (per the in-code comment, only a later step wins), so two concurrent requests carrying the same code cannot both pass; the loser is treated as an invalid code.
- `result.timeStep` is asserted non-`undefined` only when `result.valid` is true; the type does not encode that invariant, so the explicit check is required.
