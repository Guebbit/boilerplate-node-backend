---
source: src/modules/account/tests/unit/two-factor.test.ts
sha256: 3727d9974bfc5d97a9aa748b827664d830a4b08eb6773e5266a609bd966149a2
generated_at: 2026-10-14T14:47:17.596321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/two-factor.test.ts

## Purpose

Unit tests for the pure (database-free) two-factor logic in `src/modules/account/two-factor/`: TOTP secret encryption/decryption, code verification against fixed clocks, backup-code minting and salted hashing, and the shared delivered-code state machine (TTL, cooldown, attempt ceiling). Exists to pin down security invariants—replay protection, keyed (non-bare) hashing, and clock determinism—without requiring a live service or wall-clock timing.

## Key elements

- **`describe('TOTP secret encryption')`** — round-trip encrypt→decrypt under a configured method key; asserts cross-method decryption throws.
- **`describe('buildOtpauthUri')`** — validates the `otpauth://totp/` URI shape, account label, and embedded secret.
- **`describe('verifyTotpCode — fixed-clock vectors')`** — generates codes via `otplib` at a fixed epoch, verifies with `jest.useFakeTimers()`; covers accept, reject, and replay-protection (`afterTimeStep`).
- **`describe('backup codes')`** — count, distinctness, salt uniqueness, and deterministic salted-hash behaviour of `generateBackupCodes` / `hashBackupCode`.
- **`describe('delivered codes')`** — 200-draw zero-padding check, table-driven verdict matrix (match / miss / none / expired), immutability of `checkDeliveredCode`, cooldown reporting, and assertions that the stored digest is HMAC-based (not sha256, not raw-AES-key MAC).
- **`describe('the disable counter')`** — asserts the Prometheus metric `auth_two_factor_disable_total{method="totp",status="failure"}` starts at 0.
- **Helpers** — `entry()` returns a minimal `TwoFactorMethodRecord`; `now` is a fixed `Date` (2026-09-04) shared across delivered-code tests.

## Relationships

- **`../../two-factor/index.ts`** (barrel) — all SUT functions (`armDeliveredCode`, `verifyTotpCode`, `hashBackupCode`, constants, etc.) are imported from here.
- **`../../two-factor/registry.ts`** — imported for its side-effect (registering the two-factor method with the runtime registry) before tests execute.
- **`../../session/config.ts`** — `getTotpEncryptionKeyRing()` supplies the real key material so the "one key, one purpose" test can compute a raw-key HMAC and assert `hashDeliveredCode` does **not** match it.
- **`@infrastructure/observability/metrics-registry`** — `getPrometheusMetrics()` is called in the disable-counter test to scrape the metric text.
- **`@modules/users`** (index) — provides the `TwoFactorMethodRecord` type used to shape the fake record.

## Notes

- **Never wall time.** Every time-sensitive assertion either uses `jest.useFakeTimers().setSystemTime(...)` or an injected `Date`. If a test appears to pass "sometimes," suspect a missed fake-timer restore.
- **`import '../../two-factor/registry'` is deliberate side-effect import.** Removing it silently breaks registration and downstream tests in the same worker.
- **Delivered-code hashing is HMAC, not sha256.** The test explicitly asserts both that the digest matches `hashDeliveredCode` and that it does *not* match `createHash('sha256')`. If the implementation switches to a different KDF, these assertions must be updated together.
- **Crypto/version-mismatch edge cases are intentionally out of scope** here; they are covered in `tests/unit/infrastructure/security/versioned-secret.test.ts`. Do not duplicate that coverage in this file.
- The 200-iteration padding loop in the delivered-code test is a guard against a broken `randomInt` that only occasionally needs zero-padding; a single-sample check would pass ~90 % of the time on a defective implementation.
