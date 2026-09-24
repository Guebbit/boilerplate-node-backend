---
source: src/modules/account/tests/unit/two-factor.test.ts
sha256: 6a2030edc3d6470546836a54c0531b238480a7a7abfb44ab8764fea3753a611b
generated_at: 2026-09-23T18:17:51.736739+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/two-factor.test.ts

## Purpose

Unit tests for the pure (database-free) layers of the two-factor authentication module. Covers TOTP secret encryption round-trip, TOTP code verification with fixed clocks, backup-code generation/hash, and the shared delivered-code machinery (arm, consume, TTL, cooldown, attempt ceiling) that sits behind email and any future delivery channel.

## Key elements

- **`describe('TOTP secret encryption')`** — asserts `decryptTotpSecret(encryptTotpSecret(s)) === s` under the configured key. Explicitly defers crypto/version-mismatch tests to `versioned-secret.test.ts`.
- **`describe('buildOtpauthUri')`** — checks the URI format (`otpauth://totp/`), percent-encoded account, and embedded secret.
- **`describe('verifyTotpCode — fixed-clock vectors, never wall time')`** — generates codes with `otplib` at a fixed epoch, pins `jest.useFakeTimers`, and asserts: valid code accepted, wrong code rejected, and replay rejected when `afterTimeStep` names the already-consumed step.
- **`describe('backup codes')`** — asserts `generateBackupCodes()` yields exactly `BACKUP_CODE_COUNT` distinct codes; `hashBackupCode` is deterministic and collision-free across distinct inputs.
- **`describe('delivered codes …')`** — the largest block. Tests:
    - `generateDeliveredCode` always returns 6 zero-padded digits (200 samples to catch padding bugs).
    - `armDeliveredCode` / `consumeDeliveredCode` accept-then-invalidate semantics.
    - TTL expiry clears `record.codeHash`.
    - `DELIVERED_CODE_MAX_ATTEMPTS` wrong guesses burn the code even if the correct one follows.
    - `deliveryCooldownRemaining` reports `DELIVERED_CODE_RESEND_SECONDS` at arm time and 0 after elapse; 0 before any send.
    - Stored digest is HMAC under `NODE_TOTP_ENCRYPTION_KEY`, **not** a bare SHA-256.
- **`entry()`** — helper returning a minimal `TwoFactorMethodRecord` (`{ method: 'email' }`).
- **`now`** — fixed `Date('2026-09-04T12:00:00.000Z')` so delivered-code tests are time-independent.

## Relationships

- **`src/modules/account/two-factor/index.ts`** — the barrel the test imports from (`../../two-factor`); all functions under test are re-exported through it.
- **`src/modules/account/two-factor/totp.ts`**, **`backup-codes.ts`**, **`delivered-codes.ts`** — the three sub-modules whose exports are exercised here.
- **`src/modules/users/index.ts`** — supplies the `TwoFactorMethodRecord` type used to shape test fixtures.
- **`src/infrastructure/security/versioned-secret.ts`** — referenced in a comment: its encrypt/decrypt crypto is tested in its own test file; this suite only verifies the wiring (`encryptTotpSecret` / `decryptTotpSecret`).
- **`src/modules/account/services/two-factor.ts`** — the service layer that calls these pure functions; this test suite validates the functions in isolation, not the service orchestration.

## Notes

- Time-sensitive tests always pin `jest.useFakeTimers` inside a `try/finally` block that restores real timers — forgetting the `finally` will leak fake timers into subsequent tests.
- The delivered-code block uses a fixed `Date` object rather than fake timers; do not introduce `Date.now()` calls here without switching to the fake-timer pattern used in the TOTP block.
- The `createHash('sha256')` comparison in the last delivered-code test is a negative assertion: it proves the stored digest is **not** a bare SHA-256. Removing it would silently allow a downgrade to plain hashing.
- `generateDeliveredCode` sampling (200 iterations) exists because a single zero-padded-digit miss is a ~10 % probability; do not reduce it to 1.
