---
source: src/modules/account/two-factor/index.ts
sha256: ca76179db48d27ce8516de9e3dbd086aa03e475d219fe899173f6a1b9656ff81
generated_at: 2026-10-15T10:17:09.673916+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/index.ts

## Purpose
Barrel (re-export) file for the two-factor module. It is the single import surface that services, admin-recovery code, and test suites use to access the method registry and the pure crypto/validation helpers, without reaching into individual sub-modules.

## Key elements
- **Registry exports** (from `./registry`): `availableTwoFactorMethods`, `orderedEntries`, `twoFactorMethod` — the method registry the services iterate over; plus the `MethodEligibility` and `TwoFactorMethodHandler` types.
- **Backup-code exports** (from `./backup-codes`): `BACKUP_CODE_COUNT`, `generateBackupCodes`, `generateBackupCodeSalt`, `hashBackupCode`, `hashBackupCodes` — generation and one-way hashing of recovery backup codes.
- **Delivered-code exports** (from `./delivered-codes`): constants (`DELIVERED_CODE_MAX_ATTEMPTS`, `DELIVERED_CODE_RESEND_SECONDS`, `DELIVERED_CODE_TTL_MS`) and functions (`armDeliveredCode`, `checkDeliveredCode`, `deliveryCooldownRemaining`, `generateDeliveredCode`, `hashDeliveredCode`) plus the `DeliveredCodeVerdict` type.
- **`verifyDeliveredCode`** (from `./delivered-code-verify`): the verification step for delivered (email/SMS) codes.
- **Lockout constants** (from `./lockout`): `MFA_LOCK_MS`, `MFA_MAX_FAILURES`.
- **TOTP exports** (from `./totp`): `buildOtpauthUri`, `encryptTotpSecret`, `decryptTotpSecret`, `verifyTotpCode`, and the `TotpVerification` type.

## Relationships
- **Consumed by** `src/modules/account/services/reauth.ts`, `…/two-factor-enrollment.ts`, `…/two-factor-lockout.ts`, `…/two-factor-outcomes.ts` — the service layer imports the registry and helpers through this barrel.
- **Consumed by** `src/modules/account/tests/unit/two-factor.test.ts` and both integration test files — unit suites reach for the pure crypto helpers directly; integration suites exercise the registry-driven flow.
- **Re-exports from** `./registry`, `./backup-codes`, `./delivered-codes`, `./delivered-code-verify`, `./lockout`, `./totp` — these are the sub-modules whose public API is surfaced here.

## Notes
- This file contains **no logic**; it is purely a set of `export … from` statements. Changing an export name here changes the public API of the whole two-factor module.
- The `./lockout` sub-module contributes only **constants** to this barrel; its enforcement logic lives in the service layer (`two-factor-lockout.ts`), not here.
- The module JSDoc explicitly names two consumer audiences: the *services* (registry) and *unit suites / admin recovery* (crypto helpers). New sub-module exports should be added here if either audience needs them.
