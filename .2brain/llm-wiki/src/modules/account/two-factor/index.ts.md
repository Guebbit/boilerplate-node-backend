---
source: src/modules/account/two-factor/index.ts
sha256: fa47b2780e5ccf2d2574f71d47d10fd7c4fc1e604f2fe374bc5b34cda06ed6ab
generated_at: 2026-09-23T18:18:27.663161+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/index.ts

## Purpose

Barrel (re-export) file for the two-factor module. It consolidates the public API surface—method registry, backup-code helpers, delivered-code lifecycle, and TOTP crypto—behind a single import path so that services, admin recovery flows, and test suites can reach for the right pieces without deep path navigation.

## Key elements

- **Re-exports from `./registry`** – `availableTwoFactorMethods`, `orderedEntries`, `twoFactorMethod`, and the `MethodEligibility` / `TwoFactorMethodHandler` types. Drives which 2FA methods are offered and how they are executed.
- **Re-exports from `./backup-codes`** – `BACKUP_CODE_COUNT`, `generateBackupCodes`, `hashBackupCode`. Pure helpers for the admin recovery path.
- **Re-exports from `./delivered-codes`** – TTL/cooldown constants (`DELIVERED_CODE_TTL_MS`, `DELIVERED_CODE_MAX_ATTEMPTS`, `DELIVERED_CODE_RESEND_SECONDS`) plus the `armDeliveredCode` / `consumeDeliveredCode` / `clearDeliveredCode` / `generateDeliveredCode` / `hashDeliveredCode` / `deliveryCooldownRemaining` lifecycle functions.
- **Re-exports from `./totp`** – `buildOtpauthUri`, `encryptTotpSecret`, `decryptTotpSecret`, `verifyTotpCode`, and the `TotpVerification` type.

No logic lives here; every symbol is a re-export.

## Relationships

- **`src/modules/account/two-factor/registry.ts`**, **`backup-codes.ts`**, **`delivered-codes.ts`**, **`totp.ts`** – The four sibling modules whose symbols are re-exported. This file is their sole public aggregation point within the `two-factor/` directory.
- **`src/modules/account/services/two-factor.ts`** – Service layer that imports from this barrel to drive the 2FA flow (method availability, TOTP verification, delivered-code consumption, backup-code validation).
- **`src/modules/account/tests/unit/two-factor.test.ts`** – Unit tests import the pure crypto helpers (backup-code hashing, TOTP verify) directly through this barrel.
- **`tests/integration/two-factor.test.ts`** – Integration tests exercise the full 2FA lifecycle through the barrel's exports.

## Notes

- The file is intentionally logic-free; any behavior change belongs in one of the four sibling modules.
- The module doc comment flags two consumers that bypass the service layer: unit test suites and the admin recovery path, both of which reach for the crypto helpers directly. Keep exports stable or update those callers alongside.
- Type-only exports (`MethodEligibility`, `TwoFactorMethodHandler`, `TotpVerification`) are listed with the `type` keyword, so they are erased at compile time—safe to tree-shake.
