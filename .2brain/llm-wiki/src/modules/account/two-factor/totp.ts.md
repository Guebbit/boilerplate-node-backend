---
source: src/modules/account/two-factor/totp.ts
generated_at: 2026-11-22T04:12:10.060292+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/two-factor/totp.ts

## Purpose
Pure crypto layer for TOTP two-factor: encrypting/decrypting the stored TOTP secret and verifying user-entered codes, with no database access. It is kept side-effect-free so it can be unit-tested with fixed clocks and known secrets; the adapter that reads and writes the user document is the sibling `methods/totp.ts` (under `src/modules/account/two-factor/methods/`).

## Key elements
- `totpBinding(methodId)` — returns the `SecretBinding` (`purpose: 'totp'`, AAD `users:twoFactorMethods.secret:<methodId>`). Also what a re-encryption job rewraps under.
- `encryptTotpSecret(plaintext, methodId)` — encrypts a base32 secret with the TOTP key ring from `getTotpEncryptionKeyRing()`, returning versioned ciphertext for the method entry's `secret`.
- `decryptTotpSecret(stored, methodId)` — reverses the above; throws on malformed format, wrong key, or auth-tag mismatch (tampering or wrong key version).
- `buildOtpauthUri(secret, label)` — builds the `otpauth://` enrollment URI via otplib's `generateURI`. The frontend renders the QR code; the backend generates no image.
- `TotpVerification` — `{ valid, timeStep? }`; `timeStep` is present only when valid and is meant to be stored as the entry's `lastUsedStep`.
- `verifyTotpCode(secret, code, afterTimeStep?)` — async verification via otplib `verify` with ±1 step (30 s) tolerance. `afterTimeStep` rejects codes at or before that step (replay protection); leave it `undefined` for the first verification (enrollment confirm).

## Relationships
- `src/infrastructure/security/versioned-secret.ts` — supplies `encryptVersionedSecret`, `decryptVersionedSecret` and the `SecretBinding` type; the wire format lives there.
- `src/modules/account/session/config.ts` — supplies `getTotpEncryptionKeyRing()`.
- `src/infrastructure/adapters/config.ts` — `mailConfig().NODE_SMTP_SENDER` provides the issuer name in the otpauth URI.
- `src/modules/account/two-factor/methods/totp.ts` — the adapter that uses these functions and persists results on the user document.
- `src/modules/account/services/reencrypt.ts` — the re-encryption service; the `totpBinding` doc comment names re-encryption jobs as a consumer of the binding.
- `src/modules/account/two-factor/index.ts` — neighboring module entry point in the same directory.
- `src/modules/account/tests/unit/two-factor.test.ts`, `src/modules/account/tests/integration/reencrypt.test.ts`, `tests/support/authenticator.ts`, `scenarios/users.ts` — test and scenario code that exercises or supports TOTP flows.

## Notes
- The tolerance equals one step on each side. The code comments say widening it weakens the six-digit code's guessing resistance.
- The AAD is bound to the method entry's `_id`, so a ciphertext only decrypts on the entry it was written for.
- The issuer is the display-name part of `NODE_SMTP_SENDER` (text before `<`, trimmed), falling back to `'Account'`.
- otplib `verify` throws on malformed tokens (wrong length, non-digits). `verifyTotpCode` catches this and returns `{ valid: false }`, so a non-TOTP input such as a ten-character backup code fails quietly and the verification chain can try other factors.
- `timeStep` is read with an `'in'` check because `verify`'s return type is a TOTP/HOTP union. The strategy is never passed, so it defaults to TOTP.
