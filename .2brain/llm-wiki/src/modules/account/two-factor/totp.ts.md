---
source: src/modules/account/two-factor/totp.ts
sha256: 7acc1a835597f0e8dd9cb55f5e2b905acb309455907af74bfd4f09e8c4592f4a
generated_at: 2026-11-08T04:53:21.202870+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/totp.ts

## Purpose

Pure crypto layer for TOTP: encrypts/decrypts the base32 secret at rest (versioned, bound to a specific method entry) and verifies a 6-digit code against that secret with constant-time comparison, clock-skew tolerance, and replay protection. Deliberately has no database or user-document access so it can be unit-tested against fixed clocks; the persistence adapter lives in `methods/totp.ts`.

## Key elements

- **`totpBinding(methodId)`** — Builds the `SecretBinding` (purpose `'totp'`, AAD `users:twoFactorMethods.secret:<methodId>`) that ties ciphertext to a single method entry. Also the binding a re-encryption job rewraps under.
- **`encryptTotpSecret(plaintext, methodId)`** — Encrypts a base32 TOTP secret via `encryptVersionedSecret` using the key ring from session config.
- **`decryptTotpSecret(stored, methodId)`** — Reverse of the above; throws on malformed format, wrong key, or auth-tag mismatch.
- **`buildOtpauthUri(secret, label)`** — Produces the `otpauth://` URI for QR-code enrollment. Issuer is derived from `NODE_SMTP_SENDER`'s display name (falls back to `'Account'`).
- **`verifyTotpCode(secret, code, afterTimeStep?)`** — Returns `Promise<TotpVerification>`. Checks the code via otplib `verify` with ±30 s epoch tolerance; `afterTimeStep` rejects any step ≤ the given value (replay protection). Catches otplib's throw-on-malformed-token path and converts it to `{ valid: false }`.
- **`TotpVerification`** — `{ valid: boolean; timeStep?: number }`. `timeStep` is only present on success and is stored as the entry's `lastUsedStep`.
- **`TOTP_STEP_SECONDS` / `TOTP_EPOCH_TOLERANCE_SECONDS`** — 30 s step; tolerance is exactly one step either side.

## Relationships

- **`methods/totp.ts`** (adapter) — Reads/writes the user document and calls into this module for the actual encrypt/decrypt/verify work.
- **`@infrastructure/security/versioned-secret`** — Supplies `encryptVersionedSecret`, `decryptVersionedSecret`, and the `SecretBinding` type used by every encrypt/decrypt call here.
- **`src/modules/account/session/config.ts`** — Provides `getTotpEncryptionKeyRing()`, the key material passed to the versioned-secret layer.
- **`src/infrastructure/adapters/config.ts`** — `mailConfig()` is the sole source of the `otpauth://` issuer string.
- **`src/modules/account/services/reencrypt.ts`** — Re-encryption job that rewraps stored TOTP ciphertext under `totpBinding`; depends on this file's exported binding shape.
- **`src/modules/account/two-factor/index.ts`** — Barrel file that re-exports this module's public surface.
- **`tests/unit/two-factor.test.ts`** — Unit-tests `verifyTotpCode` against fixed clocks and known secrets.
- **`tests/integration/reencrypt.test.ts`** — Integration-tests the re-encryption flow that rewraps TOTP secrets.
- **`tests/support/authenticator.ts`** — Test helper that generates/enrolls TOTP secrets consistent with this module's format.

## Notes

- **AAD is the method entry's `_id`.** A ciphertext written for one entry will *not* decrypt against another entry's ID — this is by design, not a bug.
- **`verifyTotpCode` swallows throws.** otplib's `verify` *throws* on a malformed token (wrong length, non-digits) rather than resolving `{ valid: false }`. The `.catch` here normalises that to `{ valid: false }` so the multi-factor chain can move on to the next factor (e.g., a ten-character backup code that hits this guardrail).
- **Issuer is not independently configurable.** It is parsed from `NODE_SMTP_SENDER`'s display-name portion (text before `<`). There is no dedicated branding variable.
- **`afterTimeStep` is optional and replay-only.** Pass `undefined` for the first-ever verification (enrollment confirmation); pass the stored `lastUsedStep` on subsequent verifications.
- **Pure / no I/O.** No database, no network, no filesystem. If you need to read or persist the secret, go to `methods/totp.ts`.
