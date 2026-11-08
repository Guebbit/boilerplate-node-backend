---
source: src/modules/account/tests/unit/two-factor.test.ts
sha256: 3727d9974bfc5d97a9aa748b827664d830a4b08eb6773e5266a609bd966149a2
generated_at: 2026-11-08T04:50:56.843126+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/two-factor.test.ts

## Purpose

Unit tests for the pure (no-database) layer of the `account/two-factor` module. Covers TOTP secret encryption/decryption, TOTP code verification with replay protection, backup-code generation and salted hashing, delivered-code lifecycle (arm → check → cooldown → expiry), and the Prometheus disable-counter metric. All time-dependent assertions use fixed clocks or injected timestamps so the suite is deterministic and never races wall time.

## Key elements

- **`describe('TOTP secret encryption')`** — round-trip (`encryptTotpSecret` → `decryptTotpSecret`) and cross-method rejection (decrypting under a different method key throws).
- **`describe('buildOtpauthUri')`** — asserts the generated URI is a valid `otpauth://totp/` URI carrying the account label and secret.
- **`describe('verifyTotpCode')`** — three tests: accept a code at the current step, reject a code from a different step, and reject a replay of an already-consumed step (passing `afterTimeStep`). Uses `jest.useFakeTimers` pinned to `FIXED_EPOCH_SECONDS` (2030-01-01).
- **`describe('backup codes')`** — `generateBackupCodes` yields `BACKUP_CODE_COUNT` distinct codes; `generateBackupCodeSalt` is non-deterministic; `hashBackupCode` is deterministic under the same salt, distinguishes different codes and different salts.
- **`describe('delivered codes')`** — `generateDeliveredCode` produces zero-padded 6-digit strings (sampled 200× to catch padding bugs); `checkDeliveredCode` returns the correct verdict across a parameterised matrix (match / miss / none / expired); checks are side-effect-free; `deliveryCooldownRemaining` reports and elapses correctly; stored hash is an HMAC (not a bare SHA-256) and not derived from the raw AES key.
- **`describe('the disable counter')`** — asserts the Prometheus `auth_two_factor_disable_total{method="totp",status="failure"}` metric starts at `0` after importing the registry.

## Relationships

- **`src/modules/account/two-factor/index.ts`** — the barrel that re-exports every function and constant this file imports from `'../../two-factor'`.
- **`src/modules/account/two-factor/registry.ts`** — imported as a side-effect (`import '../../two-factor/registry'`) to register the Prometheus counter before the disable-counter test reads it.
- **`src/modules/account/two-factor/totp.ts`** — source of `encryptTotpSecret`, `decryptTotpSecret`, `buildOtpauthUri`, `verifyTotpCode`.
- **`src/modules/account/two-factor/backup-codes.ts`** — source of `generateBackupCodes`, `generateBackupCodeSalt`, `hashBackupCode`, `BACKUP_CODE_COUNT`.
- **`src/modules/account/two-factor/delivered-codes.ts`** — source of `armDeliveredCode`, `checkDeliveredCode`, `deliveryCooldownRemaining`, `generateDeliveredCode`, `hashDeliveredCode`, and the TTL/cooldown/attempt constants.
- **`src/modules/account/session/config.ts`** — `getTotpEncryptionKeyRing` is read to verify that `hashDeliveredCode` does NOT reuse the AES key for HMAC.
- **`src/infrastructure/observability/metrics-registry.ts`** — `getPrometheusMetrics` is called to scrape the counter value.
- **`src/modules/users/index.ts` / `src/modules/users/model.ts`** — provides the `TwoFactorMethodRecord` type used to shape the mock `entry()` fixture.

## Notes

- The file does **not** test `versioned-secret.ts` internals; the header comment explicitly defers that to `tests/unit/infrastructure/security/versioned-secret.test.ts`.
- `jest.useFakeTimers` is toggled inside a `try/finally` in every TOTP test — adding a new async test without that guard will leak fake timers into subsequent suites.
- The `entry()` helper returns a minimal `TwoFactorMethodRecord` (`{ method: 'email' }`); delivered-code tests mutate fields on the returned object (`codeAttempts`, `codeExpiresAt`) rather than constructing a full record, so shape changes in `users/model.ts` will surface as TS errors here.
- The 200-draw sample for `generateDeliveredCode` is a deliberate statistical guard (≈1-in-10 padding probability); reducing it to a single call would make the padding test flaky by design.
- The `hashDeliveredCode` test compares against **both** a bare `sha256` and an HMAC under the raw AES key to pin the "one key, one purpose" invariant; if the implementation migrates to a dedicated MAC key, only the second assertion needs updating.
