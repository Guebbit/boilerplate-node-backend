# src/modules/account/tests/unit/two-factor.test.ts

## Purpose

Unit test suite for the pure-crypto two-factor module (`two-factor.ts`). Exercises TOTP secret encryption round-trips, otpauth URI construction, TOTP code verification against a fixed clock (never wall time), and backup-code generation/hashing. Exists to guarantee the crypto layer's correctness and security invariants without any database or network dependency.

## Key elements

- **`describe('TOTP secret encryption')`** — Verifies encrypt/decrypt round-trip, per-call IV uniqueness (ciphertext differs even for identical plaintext), the `v1:` key-version prefix, and that a single-character tamper causes `decryptTotpSecret` to throw.
- **`describe('buildOtpauthUri')`** — Asserts the URI starts with `otpauth://totp/`, URL-encodes the email, and embeds the raw secret.
- **`describe('verifyTotpCode — fixed-clock vectors, never wall time')`** — Uses a constant `FIXED_EPOCH_SECONDS` (2030-01-01) and `jest.useFakeTimers().setSystemTime()` to test:
  - A code generated at that step is accepted.
  - A code one hour away is rejected.
  - **Replay protection:** presenting the same code a second time with `afterTimeStep` set to the already-consumed step returns `{ valid: false }`.
- **`describe('backup codes')`** — Confirms `generateBackupCodes()` yields exactly `BACKUP_CODE_COUNT` distinct strings, `hashBackupCode` is deterministic, and distinct codes produce distinct digests.

## Relationships

- **`src/modules/account/two-factor.ts`** — The sole production import. Every function under test (`encryptTotpSecret`, `decryptTotpSecret`, `generateTotpSecret`, `buildOtpauthUri`, `verifyTotpCode`, `generateBackupCodes`, `hashBackupCode`, `BACKUP_CODE_COUNT`) is imported directly from this module.
- **`otplib`** (third-party) — Used only to *independently* generate expected TOTP codes via `generate({ secret, epoch })`, so verification is tested against an oracle that is not the code under test.

## Notes

- **No wall-clock dependency:** Every verification test pins the system clock via `jest.useFakeTimers().setSystemTime(FIXED_EPOCH_SECONDS * 1000)` and restores real timers in a `finally` block. Do not "simplify" these tests by removing the fake timers; the entire point is deterministic, reproducible verification.
- **Replay protection is tested via the `afterTimeStep` parameter** on `verifyTotpCode`, not by any server-side state — the test relies on the function returning the consumed `timeStep` so the caller can pass it back on the next attempt.
- The tamper-detection test flips only the last base64 character (0↔1). This is the minimum mutation that exercises the authentication tag check.
