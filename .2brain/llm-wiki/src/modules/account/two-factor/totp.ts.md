---
source: src/modules/account/two-factor/totp.ts
sha256: 7acc1a835597f0e8dd9cb55f5e2b905acb309455907af74bfd4f09e8c4592f4a
generated_at: 2026-10-14T14:50:42.836359+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/totp.ts

## Purpose

Pure crypto layer for TOTP two-factor: encrypts/decrypts the base32 secret for storage and verifies user-supplied 6-digit codes against a known secret. Deliberately free of database or session concerns so it can be unit-tested against fixed clocks; the database-touching adapter lives in `methods/totp.ts`.

## Key elements

- **`totpBinding(methodId)`** — Builds the `SecretBinding` (purpose `"totp"`, AAD `users:twoFactorMethods.secret:<methodId>`) that scopes ciphertext to a specific method entry and is reused by re-encryption.
- **`encryptTotpSecret(plaintext, methodId)`** — Wraps a base32 secret into a versioned ciphertext ready for the method entry's `secret` field.
- **`decryptTotpSecret(stored, methodId)`** — Inverts the above; throws on malformed format, wrong key, or auth-tag mismatch.
- **`buildOtpauthUri(secret, label)`** — Produces the `otpauth://` URI that a frontend renders as a QR code. Issuer is derived from `mailConfig().NODE_SMTP_SENDER`.
- **`TotpVerification`** — `{ valid: boolean; timeStep?: number }` — the result shape returned by verification; `timeStep` is stored as the entry's `lastUsedStep`.
- **`verifyTotpCode(secret, code, afterTimeStep?)`** — Calls `otplib.verify` with ±1-step clock-skew tolerance and optional replay protection (`afterTimeStep`). Catches malformed-token throws and resolves `{ valid: false }` instead of propagating.

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** — Provides `encryptVersionedSecret`, `decryptVersionedSecret`, and the `SecretBinding` type used by all three crypto functions.
- **`src/modules/account/session/config.ts`** — Supplies `getTotpEncryptionKeyRing()`, the key material for both encrypt and decrypt paths.
- **`src/infrastructure/adapters/config.ts`** — `mailConfig()` is read to extract the display-name for the `otpauth://` issuer.
- **`src/modules/account/two-factor/methods/totp.ts`** — The adapter that loads/persists the user document and calls the functions here; this file never touches the database.
- **`src/modules/account/two-factor/index.ts`** — Barrel that re-exports this module (and `methods/totp.ts`) for consumers.
- **`src/modules/account/services/reencrypt.ts`** — Uses `totpBinding` to rewrap existing ciphertexts under a new key version.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — Unit-tests the pure functions here with fixed clocks and known secrets.
- **`tests/integration/scripts/reencrypt.test.ts`** — Exercises the re-encryption path that depends on `totpBinding`.

## Notes

- The AAD is the method entry's `_id`, so a ciphertext is cryptographically bound to the specific entry it was written to — copying it to another entry will fail decryption.
- `verifyTotpCode` deliberately swallows malformed-token throws (wrong length, non-digits) into `{ valid: false }` rather than rethrowing, because the verification chain tries multiple factors and a backup code like `"1234567890"` must not crash the flow.
- `epochTolerance` is exactly one 30-second step in each direction; widening it weakens the 6-digit brute-force window.
- The `timeStep` extraction uses a `'timeStep' in result` guard because otplib's return type is a union of TOTP and HOTP results; only the TOTP branch carries the field.
