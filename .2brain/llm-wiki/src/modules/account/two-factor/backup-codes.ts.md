---
source: src/modules/account/two-factor/backup-codes.ts
sha256: eed49a58edb845b81fa559e7a1c66f705a01823ec3d3f1ef54dcf367df50faf5
generated_at: 2026-11-08T04:51:23.509464+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/backup-codes.ts

## Purpose

Pure utility module that mints, salts, and hashes one-time backup codes for account recovery. Backup codes recover the **account** itself (not a single factor), are generated once when a method is first armed, shown to the user exactly once, and then only their scrypt digests persist. The module intentionally has no project-internal imports — it depends solely on `node:crypto`.

## Key elements

- **`BACKUP_CODE_COUNT`** (10) — number of one-time codes per account.
- **`generateBackupCodeSalt()`** — returns a fresh 128-bit (16-byte) hex salt. One per *user*, shared across all 10 codes, to avoid 10 sequential scrypt calls per login attempt.
- **`hashBackupCode(code, salt)`** — scrypt-digests a single code (40-bit / 5-byte hex) under the user's salt; 64-byte output, hex-encoded. The stored form in `twoFactorBackupCodes`.
- **`generateBackupCodes()`** — produces 10 random 40-bit hex codes. These are the plaintext values shown to the user and **never** stored as-is.
- **`hashBackupCodes(codes, salt)`** — maps `hashBackupCode` over a full set; the result is what gets persisted.

## Relationships

- **`src/modules/account/two-factor/index.ts`** — barrel file that re-exports this module's public API to the rest of the two-factor feature.
- **`src/modules/account/services/two-factor-enrollment.ts`** — consumer; calls `generateBackupCodes` / `generateBackupCodeSalt` / `hashBackupCodes` when an account first arms a method and stores the digests.
- **`src/modules/account/services/two-factor-lockout.ts`** — consumer; verifies a submitted code by calling `hashBackupCode` against the stored salt during lockout recovery.
- **`src/modules/account/tests/unit/two-factor.test.ts`**, **`src/modules/account/tests/integration/two-factor-concurrency.test.ts`**, **`scenarios/users.ts`**, **`tests/integration/scenarios/shop.test.ts`** — test and scenario files that exercise the generate/hash/verify round-trip.

## Notes

- **One salt per user, not per code.** The code comments explicitly warn that a per-code salt would force up to `BACKUP_CODE_COUNT` (10) scrypt calls on a single login, turning recovery into a CPU-burn DoS vector.
- **scrypt, not plain sha256.** At 40 bits of entropy the codes fall below NIST 800-63B's 112-bit threshold for a "look-up secret" that may use a plain hash. Scrypt compensates so a database dump can't be cracked on a single GPU.
- **Codes are `randomBytes(5).toString('hex')`** — i.e. 10 hex characters. They are not base32/base64 or digit strings despite the doc mentioning "digits, as typed"; the actual format is lowercase hex.
- The module is deliberately side-effect-free and stateless; all persistence decisions live in the consuming services.
