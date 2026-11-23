---
source: src/modules/account/two-factor/index.ts
source_sha256: ca76179db48d27ce8516de9e3dbd086aa03e475d219fe899173f6a1b9656ff81
context_sha256: 2cbccfd61545305ca03e40e81b127fd0282f60f156d1bff2bed040bf309f8637
generated_at: 2026-11-22T04:10:59.755052+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/two-factor/index.ts

## Purpose
Barrel file for the two-factor module. Per its doc comment, it exposes the method registry that the account services drive, plus the pure crypto helpers that unit suites and the admin recovery path import directly. It contains no logic of its own, only re-exports.

## Key elements
- **Registry** (from `./registry`): `availableTwoFactorMethods`, `orderedEntries`, `twoFactorMethod`, and the types `MethodEligibility` and `TwoFactorMethodHandler`.
- **Backup codes** (from `./backup-codes`): `BACKUP_CODE_COUNT`, `generateBackupCodes`, `generateBackupCodeSalt`, `hashBackupCode`, `hashBackupCodes`.
- **Delivered codes** (from `./delivered-codes`): the constants `DELIVERED_CODE_MAX_ATTEMPTS`, `DELIVERED_CODE_RESEND_SECONDS` and `DELIVERED_CODE_TTL_MS`. The functions `armDeliveredCode`, `checkDeliveredCode`, `deliveryCooldownRemaining`, `generateDeliveredCode` and `hashDeliveredCode`. The type `DeliveredCodeVerdict`.
- **Delivered code verification** (from `./delivered-code-verify`): `verifyDeliveredCode`.
- **Lockout** (from `./lockout`): the constants `MFA_LOCK_MS` and `MFA_MAX_FAILURES`.
- **TOTP** (from `./totp`): `buildOtpauthUri`, `decryptTotpSecret`, `encryptTotpSecret`, `verifyTotpCode`, and the type `TotpVerification`.

## Relationships
- Re-exports from the sibling files `registry.ts`, `backup-codes.ts`, `delivered-codes.ts`, `delivered-code-verify.ts`, `lockout.ts` and `totp.ts`. Those files hold the implementations.
- The services `two-factor-enrollment.ts`, `two-factor-lockout.ts`, `two-factor-outcomes.ts` and `reauth.ts` are graph neighbors. The doc comment says the services drive the registry. This file does not show which exports each service uses.
- The unit tests (`two-factor.test.ts`, `two-factor-outcomes.test.ts`) and integration tests (`two-factor.test.ts`, `two-factor-concurrency.test.ts`) are also neighbors. The doc comment says the unit suites use the pure helpers directly.

## Notes
- From `./lockout`, only the constants `MFA_LOCK_MS` and `MFA_MAX_FAILURES` are exported through the barrel.
