---
source: src/modules/account/tests/unit/two-factor.test.ts
sha256: 2b1c7caf435a3e1261625569aea4b3cd6cd68e81b8d18a8e7050948a9bf22d2b
generated_at: 2026-09-27T14:37:20.555321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/two-factor.test.ts

## Purpose
Unit tests for the pure (no-database) layers of the `account/two-factor` module. Covers TOTP secret encryption round-trip, OTP URI construction, code verification with replay protection, backup-code generation and salting, and the full delivered-code lifecycle (arm, consume, TTL, cooldown, attempt ceiling). Everything runs against injected or fake clocks—never wall time.

## Key elements

- **`describe('TOTP secret encryption')`** — asserts `decryptTotpSecret(encryptTotpSecret(s)) === s`.
- **`describe('buildOtpauthUri')`** — validates the `otpauth://totp/` scheme, URL-encoded account name, and embedded secret.
- **`describe('verifyTotpCode — fixed-clock vectors')`** — uses `jest.useFakeTimers().setSystemTime()` pinned to `FIXED_EPOCH_SECONDS` (1 893 456 000). Verifies accept, reject, and replay-protection (same `timeStep` passed as `afterTimeStep`).
- **`describe('backup codes')`** — checks `BACKUP_CODE_COUNT` distinct codes, salt uniqueness per call, deterministic re-hash under the same salt, and salt sensitivity.
- **`describe('delivered codes')`** — exercises `armDeliveredCode`, `consumeDeliveredCode`, `deliveryCooldownRemaining`, `generateDeliveredCode`, and `hashDeliveredCode` against a fixed `now` (2026-09-04). Verifies 6-digit zero-padding (200 draws), single-use consumption, TTL expiry + cleanup, max-attempt burn, cooldown arithmetic, and that stored hashes are keyed HMAC (not bare SHA-256).
- **`entry()`** — local helper returning a minimal `TwoFactorMethodRecord` (`{ method: 'email' }`).

## Relationships

- **`src/modules/account/two-factor/index.ts`** — the sole production import; re-exports every symbol under test from the sibling sub-modules.
- **`src/modules/account/two-factor/totp.ts`** — source of `encryptTotpSecret`, `decryptTotpSecret`, `buildOtpauthUri`, `verifyTotpCode`.
- **`src/modules/account/two-factor/backup-codes.ts`** — source of `generateBackupCodes`, `generateBackupCodeSalt`, `hashBackupCode`, `BACKUP_CODE_COUNT`.
- **`src/modules/account/two-factor/delivered-codes.ts`** — source of all delivered-code functions and constants (`DELIVERED_CODE_TTL_MS`, `DELIVERED_CODE_RESEND_SECONDS`, `DELIVERED_CODE_MAX_ATTEMPTS`, `hashDeliveredCode`).
- **`src/modules/account/two-factor/registry.ts`** — re-exported through the index; provides the `TwoFactorMethodRecord`-shaped record mutated by arm/consume tests.
- **`src/infrastructure/security/versioned-secret.ts`** — underlying crypto for `encryptTotpSecret`/`decryptTotpSecret`; its own behaviour is covered in `versioned-secret.test.ts`, so this file only checks the wiring.
- **`src/modules/account/services/two-factor.ts`** — production consumer of the same sub-module symbols; this test file mirrors the shape of records it passes to handlers.

## Notes

- TOTP verification tests pin the system clock via `jest.useFakeTimers().setSystemTime()` inside a `try/finally` that restores real timers. Forgetting the `finally` will leak fake timers into subsequent suites.
- The replay-protection test calls `verifyTotpCode` a second time passing `first.timeStep` as the `afterTimeStep` argument—the third positional parameter is the guard, not a separate API.
- Delivered-code hash assertion compares against `hashDeliveredCode('123456')` (the module's own HMAC) **and** asserts it is *not* a plain `sha256` hex digest. This is a regression guard against a downgrade to an unkeyed digest.
- The 200-draw sample in the padding test is deliberate: a single `randomInt` draw would mask a padding bug ~90 % of the time.
- The module doc-comment explicitly states the crypto/version-mismatch contract lives in `versioned-secret.ts`; do not duplicate those assertions here.
