---
source: src/modules/account/tests/unit/two-factor.test.ts
source_sha256: 626a2a3a25ed5a26820a5394f9949140360a6356638193be73e948988365fc83
context_sha256: ec11ab9f3db618287ca13916bbeba06dbe2f207dbfda6ab6c74937badd5015d2
generated_at: 2026-11-22T04:09:53.854900+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/two-factor.test.ts

## Purpose
Unit tests for the pure layers of `account/two-factor/`, with no database involved. It covers TOTP secret encryption, TOTP code verification against fixed clocks, backup-code generation and salted hashing, and the delivered-code machinery (email and later channels): TTL, resend cooldown and attempt ceiling, all driven by an injected `Date`. It also checks that the disable counter is pre-seeded in the metrics output.

## Key elements
- **`TOTP secret encryption`**: round-trips `encryptTotpSecret`/`decryptTotpSecret` under the configured key. It also checks that a secret copied to a different method id (`method-1` → `method-2`) fails to decrypt. The crypto itself is tested elsewhere (`versioned-secret.test.ts`); this only covers the wiring.
- **`buildOtpauthUri`**: checks the `otpauth://totp/` prefix, the URL-encoded account (`person%40example.com`) and the secret.
- **`verifyTotpCode`**: uses a fixed epoch (`1_893_456_000`) with `jest.useFakeTimers().setSystemTime`. Codes are generated independently with `otplib`'s `generate`.
  - A code for the current step is accepted.
  - A code an hour away is rejected.
  - Replay is rejected when `afterTimeStep` is set to the previously matched `timeStep`.
- **`backup codes`**: `generateBackupCodes` returns `BACKUP_CODE_COUNT` distinct codes. `generateBackupCodeSalt` is fresh on every call. `hashBackupCode` is deterministic for the same code and salt, and differs across codes and across salts.
- **`delivered codes`**:
  - `generateDeliveredCode` returns six zero-padded digits, checked over 200 draws.
  - A table-driven `checkDeliveredCode` test covers the verdicts `match`, `miss`, `none` and `expired`. The cases are the attempt ceiling and the TTL boundaries at TTL−1, TTL and TTL+1.
  - `checkDeliveredCode` does not mutate the record.
  - `deliveryCooldownRemaining` equals `DELIVERED_CODE_RESEND_SECONDS` right after arming and 0 once it elapses or before any send.
  - `armDeliveredCode` stores `hashDeliveredCode(code)`. That value is neither the digits nor a bare sha256.
  - `hashDeliveredCode` is not an HMAC under the raw AES key from `getTotpEncryptionKeyRing()[0].key`.
- **`the disable counter`**: `getPrometheusMetrics()` output must contain `auth_two_factor_disable_total{method="totp",status="failure"} 0`.
- **Helpers**: `entry()` builds a bare `{ method: 'email' }` `TwoFactorMethodRecord`. `now` is a fixed `2026-09-04T12:00:00.000Z`.

## Relationships
- Imports everything under test from `src/modules/account/two-factor/index.ts`, which re-exports the helpers from `totp.ts`, `backup-codes.ts` and `delivered-codes.ts`.
- Imports `../../two-factor/registry` for its side effect only. This presumably registers the metrics, since the disable-counter test relies on it.
- Reads `getTotpEncryptionKeyRing` from `src/modules/account/session/config.ts` to check that the delivered-code MAC does not use the raw key.
- Reads `getPrometheusMetrics` from `src/infrastructure/observability/metrics-registry.ts` for the counter test.
- Uses the `TwoFactorMethodRecord` type from `src/modules/users` (`index.ts`/`model.ts`).

## Notes
- The tests use fixed epochs and fake timers, never wall time. Fake timers are restored in `finally` blocks.
- The 200-draw sample in the six-digit test guards against a missing zero-pad. A single draw would only rarely hit a value that needs padding.
- The `none` verdict also covers an armed record whose `codeExpiresAt` has been cleared.
