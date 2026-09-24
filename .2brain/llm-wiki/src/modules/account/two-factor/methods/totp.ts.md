---
source: src/modules/account/two-factor/methods/totp.ts
sha256: 380fb684df90d1b1cb6253b03115b439fb5eff8b02091205c8f3ea1ff9ea5c21
generated_at: 2026-09-23T18:18:51.562870+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/methods/totp.ts

## Purpose

Registry adapter for the TOTP two-factor method. It translates the raw crypto helpers from `../totp.ts` into the `TwoFactorMethodHandler` contract the account registry expects: mint an encrypted secret at enrollment and validate a six-digit code at verification. All actual HMAC / time-step logic lives elsewhere; this file is purely the glue.

## Key elements

- **`totpMethod`** (exported const, type `TwoFactorMethodHandler`)
  - `name: 'totp'` — registry key.
  - `delivers: false` — device-bound method; no push/SMS channel.
  - `available()` / `eligibility()` — always `true`; TOTP has no account or channel prerequisites.
  - `target()` — returns `undefined` (no delivery target needed).
  - `setup(user, entry)` — generates a fresh base32 secret via `otplib`, encrypts it into `entry.secret`, clears `entry.lastUsedStep`, and returns `{ secret, otpauthUri }` for the client to scan.
  - `verify(_user, entry, code)` — decrypts the stored secret, delegates to `verifyTotpCode`, and advances `entry.lastUsedStep` on success to enforce replay protection.

## Relationships

- **`src/modules/account/two-factor/registry.ts`** — supplies the `TwoFactorMethodHandler` type that `totpMethod` implements; the registry consumes this export to route setup/verify calls.
- **`src/modules/account/two-factor/totp.ts`** — provides the four crypto helpers imported here (`buildOtpauthUri`, `decryptTotpSecret`, `encryptTotpSecret`, `verifyTotpCode`). All secret generation, encryption, and code validation logic lives in that file.

## Notes

- `entry.lastUsedStep` is explicitly reset to `undefined` inside `setup`. A new secret invalidates any prior time-step window; preserving the old value would cause the first legitimate code to be rejected as a replay.
- The raw `secret` is never persisted in plaintext — it is encrypted via `encryptTotpSecret` before being written to `entry`, and decrypted only for the duration of a `verify` call.
- `setup` returns the plaintext `secret` and `otpauthUri` to the caller (for QR/provisioning) but does not retain them in the entry.
