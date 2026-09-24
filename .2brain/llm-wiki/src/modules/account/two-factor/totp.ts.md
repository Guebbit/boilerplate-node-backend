---
source: src/modules/account/two-factor/totp.ts
sha256: d81a16e5b3b59ef35cfbf0f680a9b8c930ef6b2089be6b841bf3703d75de520d
generated_at: 2026-09-23T18:19:19.046027+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/totp.ts

## Purpose

Pure TOTP crypto layer: encrypting/decrypting the base32 secret at rest, building the `otpauth://` enrollment URI, and verifying a 6-digit code with replay protection. Deliberately contains no database access so it can be unit-tested against fixed clocks and known secrets. The I/O adapter that persists results to the user document lives in `methods/totp.ts`.

## Key elements

- **`TOTP_STEP_SECONDS` / `TOTP_EPOCH_TOLERANCE_SECONDS`** – Both 30. The tolerance is ±1 step to absorb clock drift; widening it directly weakens the 6-digit codespace.
- **`encryptTotpSecret(plaintext: string): string`** – Encrypts a base32 TOTP secret via `encryptVersionedSecret` + the TOTP key ring; output is stored in the method entry's `secret` field.
- **`decryptTotpSecret(stored: string): string`** – Reverses the above. Throws on malformed format, wrong key version, or auth-tag mismatch.
- **`buildOtpauthUri(secret: string, label: string): string`** – Produces the `otpauth://` URI for QR-code enrollment. Frontend renders the QR; this module only builds the string.
- **`TotpVerification`** – `{ valid: boolean; timeStep?: number }`. `timeStep` is present only when `valid` is true; callers store it as `lastUsedStep`.
- **`verifyTotpCode(secret, code, afterTimeStep?)`** – Constant-time verification via `otplib.verify` with ±1-step epoch tolerance. `afterTimeStep` enforces replay protection (a code at or before that step is rejected). Returns a resolved `{ valid: false }` for any malformed input rather than throwing.

## Relationships

- **`@infrastructure/security/versioned-secret`** – Provides `encryptVersionedSecret` / `decryptVersionedSecret`; this file is a domain-specific caller that supplies the TOTP key ring and the `'TOTP'` purpose tag.
- **`../session/config`** – Source of `getTotpEncryptionKeyRing()`, the key material used by both encrypt and decrypt.
- **`methods/totp.ts`** – The adapter that reads the user document, calls `decryptTotpSecret` before verification, and writes back `lastUsedStep` after a successful `verifyTotpCode` call.
- **`two-factor/index.ts`** – Barrel module that re-exports (or routes to) this file's public API.
- **`tests/unit/two-factor.test.ts`** – Unit-tests the pure functions here with fixed clocks and known secrets, relying on the absence of DB I/O.

## Notes

- **Issuer branding is not a dedicated variable.** `buildOtpauthUri` derives the issuer from `process.env.NODE_SMTP_SENDER` (the display name before `<`). If that env var is unset it falls back to the literal string `'Account'`. Changing the SMTP sender address silently changes what appears in authenticator apps.
- **Malformed tokens throw inside otplib, not resolve.** `verifyTotpCode` swallows that throw and returns `{ valid: false }`. This means a 10-character backup code typed into the TOTP field fails silently as "invalid TOTP" rather than surfacing as a distinct error—by design, so the verification chain can try the next factor.
- **`afterTimeStep` is `undefined` on enrollment confirm.** There is no prior step to replay against, so omit it on the first verification.
- **`timeStep` extraction uses `'timeStep' in result`** because otplib's `verify` return type is a TOTP/HOTP union; the guard narrows to the TOTP branch where the field actually exists.
