---
source: src/modules/account/two-factor/index.ts
sha256: ca76179db48d27ce8516de9e3dbd086aa03e475d219fe899173f6a1b9656ff81
generated_at: 2026-11-08T04:52:11.387219+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/index.ts

## Purpose

Barrel (re-export) file for the two-factor subsystem. It has no logic of its own — it simply re-exports the public API surface of the six sibling modules (`registry`, `backup-codes`, `delivered-codes`, `delivered-code-verify`, `lockout`, `totp`) so that consumers can `import` from a single path. Per its own JSDoc, it exposes the method registry that services drive and the pure crypto helpers used by unit suites and the admin recovery path.

## Key elements

- **Registry exports** (`./registry`): `availableTwoFactorMethods`, `orderedEntries`, `twoFactorMethod`, and the types `MethodEligibility`, `TwoFactorMethodHandler`.
- **Backup-code helpers** (`./backup-codes`): constants `BACKUP_CODE_COUNT`; functions `generateBackupCodes`, `generateBackupCodeSalt`, `hashBackupCode`, `hashBackupCodes`.
- **Delivered-code helpers** (`./delivered-codes`): constants `DELIVERED_CODE_MAX_ATTEMPTS`, `DELIVERED_CODE_RESEND_SECONDS`, `DELIVERED_CODE_TTL_MS`; functions `armDeliveredCode`, `checkDeliveredCode`, `deliveryCooldownRemaining`, `generateDeliveredCode`, `hashDeliveredCode`; type `DeliveredCodeVerdict`.
- **Delivered-code verification** (`./delivered-code-verify`): `verifyDeliveredCode`.
- **Lockout constants** (`./lockout`): `MFA_LOCK_MS`, `MFA_MAX_FAILURES`.
- **TOTP helpers** (`./totp`): `buildOtpauthUri`, `decryptTotpSecret`, `encryptTotpSecret`, `verifyTotpCode`, type `TotpVerification`.

## Relationships

- **Re-exports from (sibling modules):** `registry.ts`, `backup-codes.ts`, `delivered-codes.ts`, `delivered-code-verify.ts`, `lockout.ts`, `totp.ts` — all live in the same `two-factor/` directory.
- **Consumed by (services):** `services/reauth.ts`, `services/two-factor-enrollment.ts`, `services/two-factor-lockout.ts`, `services/two-factor-outcomes.ts` import through this barrel to drive the registry and call crypto helpers.
- **Consumed by (tests):** `tests/unit/two-factor.test.ts`, `tests/integration/two-factor.test.ts`, `tests/integration/two-factor-concurrency.test.ts` import the pure helpers (backup-code hashing, TOTP verification, lockout constants) directly via this barrel.

## Notes

- This file is a **pure re-export**; adding a new helper to a sibling module requires a corresponding line here for it to be reachable by external consumers.
- Type-only exports (`MethodEligibility`, `TwoFactorMethodHandler`, `DeliveredCodeVerdict`, `TotpVerification`) are re-exported with the `type` keyword where applicable — importers should use `import type` for them under `verbatimModuleSyntax`.
- Because it is a barrel, bundlers may include all six sibling modules in a given import; be mindful of tree-shaking if a consumer only needs one helper.
