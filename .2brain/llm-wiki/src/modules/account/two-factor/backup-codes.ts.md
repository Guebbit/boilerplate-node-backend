---
source: src/modules/account/two-factor/backup-codes.ts
sha256: eed49a58edb845b81fa559e7a1c66f705a01823ec3d3f1ef54dcf367df50faf5
generated_at: 2026-09-27T14:37:31.004373+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/backup-codes.ts

## Purpose

Provides the full lifecycle utilities for one-time account-recovery backup codes: generation, per-user salting, and scrypt hashing. Backup codes recover the account itself (not a specific factor), are minted once when an account first arms two-factor, and are shown to the user exactly once before being stored only as salted digests.

## Key elements

- **`BACKUP_CODE_COUNT`** (10) — exported constant; how many one-time codes are issued per account.
- **`generateBackupCodeSalt()`** — returns a fresh 128-bit (16-byte) hex salt, created once per user and shared across all of that user's codes.
- **`hashBackupCode(code, salt)`** — scrypt-hashes a single typed code under the account's salt (64-byte output, hex). The stored form of a code.
- **`generateBackupCodes()`** — produces `BACKUP_CODE_COUNT` random 40-bit hex codes (5 bytes each). Shown to the user once; never persisted raw.
- **`hashBackupCodes(codes, salt)`** — maps `hashBackupCode` over an array, returning the list of digests to persist under `twoFactorBackupCodes`.
- Internal constants (`BACKUP_CODE_BYTES`, `BACKUP_CODE_SALT_BYTES`, `BACKUP_CODE_KEY_LENGTH`) fix entropy and scrypt parameters.

## Relationships

- **`src/modules/account/services/two-factor.ts`** — the two-factor service that calls into this module to mint, hash, and verify backup codes as part of account setup and the recovery flow.
- **`src/modules/account/two-factor/index.ts`** — barrel re-export; consumers import backup-code helpers through this index rather than the file directly.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — unit tests exercise the generate/hash/verify round-trip defined here.

## Notes

- **One salt per user, not per code.** A per-code salt would force up to 10 scrypt evaluations per login attempt. The single shared salt is stored as `twoFactorBackupCodeSalt` on the account row.
- **scrypt, not a plain hash, is mandatory here.** At 40 bits the codes fall below NIST SP 800-63B §5.1.2.2's 112-bit threshold for "look-up secret" verifiers that may use a bare digest; scrypt is the compensating strength so a leaked DB dump isn't trivially brute-forced.
- Codes are hex strings (5 random bytes), *not* numeric digits, despite the `code` parameter being described as "the digits, as typed." Callers pass the hex string the user types.
- The module is pure — no I/O, no state. All persistence is the caller's responsibility.
