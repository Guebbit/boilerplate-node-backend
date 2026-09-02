# src/modules/account/two-factor.ts

## Purpose

Pure-crypto layer for TOTP two-factor authentication: secret generation, AES-256-GCM encryption/decryption of the stored secret, code verification, and one-time backup-code minting. Contains no database or HTTP logic — that lives in `services/two-factor.ts`. The split exists so the crypto can be unit-tested against fixed clocks and known secrets without a database in the loop.

## Key elements

- **`encryptTotpSecret` / `decryptTotpSecret`** — AES-256-GCM round-trip for the base32 TOTP secret. Stored format is `version:iv-hex:auth-tag-hex:ciphertext-hex`; the version field enables key rotation without a data migration.
- **`deriveKey`** (internal) — SHA-256 of the operator-chosen `NODE_TOTP_ENCRYPTION_KEY` string to produce the 32-byte AES key.
- **`generateTotpSecret`** — wraps `otplib.generateSecret()`; one call per enrollment.
- **`buildOtpauthUri`** — builds the `otpauth://` URI for QR-code scanning. Issuer is derived from `NODE_SMTP_SENDER` (display name before `<`).
- **`verifyTotpCode`** — constant-time TOTP check with ±1-step tolerance. Accepts `afterTimeStep` for replay protection (reject codes at or before a stored step). Returns `TotpVerification { valid, timeStep? }`.
- **`generateBackupCodes`** — mints `BACKUP_CODE_COUNT` (10) 10-char hex one-time codes via `randomBytes(5)`. Shown once at enrollment; only the SHA-256 hash is persisted.
- **`hashBackupCode`** — re-export of `hashToken` from `@modules/users`; SHA-256, chosen over bcrypt because codes are high-entropy and bcrypt would only slow login.
- **`TOTP_STEP_SECONDS` (30), `TOTP_EPOCH_TOLERANCE_SECONDS` (30)** — RFC 6238 step and ±1-step clock-drift window.

## Relationships

- **`services/two-factor.ts`** — The orchestration neighbor. It imports every public export from this file, calls `encryptTotpSecret` / `decryptTotpSecret` before/after DB writes, calls `verifyTotpCode` during login, and calls `generateBackupCodes` + `hashBackupCode` at enrollment.
- **`session/config.ts`** — Supplies `getTotpEncryptionKey()` (returns `{ version, key }`), the only config this file reads.
- **`@modules/users` (via `src/modules/users/index.ts`)** — Source of `hashToken`, re-exported here as `hashBackupCode` so the account module doesn't duplicate the digest logic.
- **`tests/unit/two-factor.test.ts`** — Exercises the crypto functions against fixed clocks and known secrets; the primary reason this file has no DB dependency.

## Notes

- **`otplib.verify` throws on malformed tokens** (wrong length, non-digits) rather than resolving `{ valid: false }`. The `.catch` in `verifyTotpCode` converts that throw to `{ valid: false }`. Without it, a 10-char hex backup code fed through the TOTP path would 500 every attempt instead of falling through to the backup-code check in `verifyCodeOrBackup`.
- **`totpIssuer` is not configurable** via a dedicated env var — it reuses the display name from `NODE_SMTP_SENDER`. Changing the SMTP sender name changes the label in authenticator apps.
- **`timeStep` on `TotpVerification`** is intended to be stored as `twoFactorLastUsedStep` by the service layer and passed back as `afterTimeStep` on subsequent verifications for replay protection.
- **Key versioning is strict**: `decryptTotpSecret` throws on any version mismatch rather than trying to resolve it, keeping rotation logic entirely in the operator/service layer.
