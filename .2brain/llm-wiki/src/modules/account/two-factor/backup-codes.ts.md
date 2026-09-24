---
source: src/modules/account/two-factor/backup-codes.ts
sha256: 8d76612cbd6d061a0f7b94f251ffffd30737c09a5e3420ffaddcf45257b6c813
generated_at: 2026-09-23T18:18:03.892617+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/backup-codes.ts

## Purpose

Provides the one-time backup-code primitives for account recovery. Backup codes recover the **account** itself (not a specific 2FA factor), are minted exactly once—by whichever method the account arms first—and are shown to the user a single time. This file isolates generation and hashing so every 2FA method shares the same recovery path.

## Key elements

- **`BACKUP_CODE_COUNT`** (const, `10`) — the number of codes issued per account.
- **`generateBackupCodes()`** — returns an array of `BACKUP_CODE_COUNT` high-entropy hex strings (5 × `randomBytes` → 10 hex chars each). Intended for one-time display; never persisted in plaintext.
- **`hashBackupCode`** (re-export of `hashToken` from `@modules/users`) — SHA-256 digest used for storage. Chosen over bcrypt because the codes are already high-entropy and one-time; stretching would only add latency to the login path.

## Relationships

- **`src/modules/users/index.ts`** — source of `hashToken`, re-exported here as `hashBackupCode`. This is the only import in the file.
- **`src/modules/account/two-factor/index.ts`** — barrel for the two-factor sub-module; re-exports the symbols defined here so callers can import from the module root.
- **`src/modules/account/services/two-factor.ts`** — consumer that triggers `generateBackupCodes` when a method is first armed and validates a submitted code against the stored `hashBackupCode` digest during recovery.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — unit tests that exercise code generation, hashing, and the recovery flow through this module.

## Notes

- Codes are **per account**, not per 2FA method. Whichever method is armed first mints the set; subsequent methods reuse it.
- The stored form is a SHA-256 hex digest (same shape as refresh-token digests), **not** a bcrypt hash. Do not "upgrade" the storage algorithm without reviewing the login-path cost implications documented in the module comment.
- `generateBackupCodes` returns raw hex strings. The caller is responsible for showing them once and immediately persisting only the `hashBackupCode` values.
