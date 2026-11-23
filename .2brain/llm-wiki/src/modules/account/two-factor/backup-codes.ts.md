---
source: src/modules/account/two-factor/backup-codes.ts
source_sha256: eed49a58edb845b81fa559e7a1c66f705a01823ec3d3f1ef54dcf367df50faf5
context_sha256: a601c7ea7d4ad3227c7dda8aea8abafa6931b923035d2892b4bcdcf70277c8cd
generated_at: 2026-11-22T04:10:25.054586+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/two-factor/backup-codes.ts

## Purpose
Backup codes are the account-level recovery path shared by every two-factor method. They are minted once, by whichever method an account arms first, and are never shown again. This file generates the codes, generates the per-user salt, and hashes codes for storage.

## Key elements
- `BACKUP_CODE_COUNT` (10): number of one-time codes per account.
- `generateBackupCodeSalt()`: returns a 128-bit salt (16 random bytes, hex). It is minted once per set of codes and reused for every code in that set.
- `generateBackupCodes()`: returns `BACKUP_CODE_COUNT` plaintext codes. Each is 5 random bytes (40 bits) hex-encoded. They are shown to the caller once and never stored in this form.
- `hashBackupCode(code, salt)`: computes scrypt (64-byte output) of the code under the salt and returns the hex digest. The digest is stored in `twoFactorBackupCodes`, and the salt is the account's `twoFactorBackupCodeSalt`.
- `hashBackupCodes(codes, salt)`: maps `hashBackupCode` over a freshly minted set using the same salt.

## Relationships
The neighbor files are listed in the dependency graph, but this file's content shows no imports from them or exports consumed by them. The only visible links are in comments and docs:
- The doc comments refer to the account fields `twoFactorBackupCodes` and `twoFactorBackupCodeSalt`.
- The "minted by whichever method an account arms first" wording suggests the enrollment service (`src/modules/account/services/two-factor-enrollment.ts`) as the likely caller, but this file does not confirm that.
- `src/modules/account/two-factor/index.ts` is the likely re-export point, but this is also not visible here.

## Notes
- The salt is per user, not per code. A per-code salt would require up to `BACKUP_CODE_COUNT` scrypt calls on a single login attempt, which would make the recovery path a cheap CPU-burner.
- Codes are only 40 bits, below NIST 800-63B's 112-bit threshold for plainly hashed look-up secrets. For that reason storage uses scrypt rather than a bare sha256, so a database dump cannot be cracked cheaply.
- `scryptSync` is synchronous and blocks the event loop. Verification cost grows with the number of hashes computed per attempt.
- Nothing here verifies a code. Callers must hash the typed code with the account's salt and compare it against the stored digests themselves.
