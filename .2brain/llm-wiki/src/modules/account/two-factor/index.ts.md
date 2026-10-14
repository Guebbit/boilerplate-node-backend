---
source: src/modules/account/two-factor/index.ts
sha256: fea7aa1c1747a77c8ba2ccc5578ffa4ca9d6d576fc347731c486e9207f843a34
generated_at: 2026-10-14T14:48:52.539346+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/index.ts

## Purpose

Pure barrel (re-export) file for the two-factor module. It flattens the sub-module public API into a single import surface so that services and tests can `import { … } from '…/two-factor'` without referencing individual file paths. Contains no logic of its own.

## Key elements

All exports are re-exports from sibling files:

- **`./registry`** — `availableTwoFactorMethods`, `orderedEntries`, `twoFactorMethod`, and the `MethodEligibility` / `TwoFactorMethodHandler` types. The method registry the services drive to discover and dispatch two-factor methods.
- **`./backup-codes`** — `BACKUP_CODE_COUNT`, `generateBackupCodes`, `generateBackupCodeSalt`, `hashBackupCode`, `hashBackupCodes`. Pure crypto helpers for the one-time recovery codes.
- **`./delivered-codes`** — TTL/cooldown constants (`DELIVERED_CODE_*`), `armDeliveredCode`, `clearDeliveredCode`, `checkDeliveredCode`, `deliveryCooldownRemaining`, `generateDeliveredCode`, `hashDeliveredCode`, and the `DeliveredCodeVerdict` type.
- **`./delivered-code-verify`** — `verifyDeliveredCode` (higher-level verification entry point).
- **`./lockout`** — `MFA_LOCK_MS`, `MFA_MAX_FAILURES` constants governing failure-count lockout.
- **`./totp`** — `buildOtpauthUri`, `encryptTotpSecret`, `decryptTotpSecret`, `verifyTotpCode`, and the `TotpVerification` type.

## Relationships

- **Re-exports from (siblings):** `registry.ts`, `backup-codes.ts`, `delivered-codes.ts`, `delivered-code-verify.ts`, `lockout.ts`, `totp.ts`. This file is the sole import boundary for those modules' public API.
- **Consumed by (services):** `services/reauth.ts`, `services/two-factor-challenge.ts`, `services/two-factor-enrollment.ts`, `services/two-factor-lockout.ts`, `services/two-factor-outcomes.ts` import the registry and method handlers through this barrel.
- **Consumed by (tests):** `tests/unit/two-factor.test.ts`, `tests/integration/two-factor.test.ts`, `tests/integration/two-factor-concurrency.test.ts` import the pure crypto helpers (backup-codes, totp, delivered-codes) and constants directly via this barrel.

## Notes

- Adding a new export to a sub-module file is not sufficient to surface it — it must also be re-exported here or consumers will need to use a deep import path.
- The file's own JSDoc calls out two distinct consumer tiers: services (which drive the registry) and the unit-suite / admin-recovery path (which reach for the pure crypto helpers directly). This distinction matters when deciding where a new helper belongs.
- No runtime side-effects; safe to import in any context (server, worker, test) without triggering registration or I/O.
