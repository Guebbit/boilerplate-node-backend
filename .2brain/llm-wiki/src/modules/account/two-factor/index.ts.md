---
source: src/modules/account/two-factor/index.ts
sha256: 8ec78d23cce3c7a17a545f9764c39e7ecc4211d88a9ff1fb1682552427818276
generated_at: 2026-09-27T14:37:55.694277+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/index.ts

## Purpose

Barrel (re-export) file for the two-factor module. It gives consumers a single import path for the registry API, backup-code crypto helpers, delivered-code (one-time code) helpers, and TOTP utilities without needing to know each sub-module's file location.

## Key elements

- **From `./registry`** — `availableTwoFactorMethods`, `orderedEntries`, `twoFactorMethod`, `MethodEligibility`, `TwoFactorMethodHandler`. The dispatch/eligibility layer services use to enumerate and invoke a user's enrolled methods.
- **From `./backup-codes`** — `BACKUP_CODE_COUNT`, `generateBackupCodes`, `generateBackupCodeSalt`, `hashBackupCode`, `hashBackupCodes`. Pure helpers for generating and hashing the static recovery codes handed out at enrollment.
- **From `./delivered-codes`** — `DELIVERED_CODE_MAX_ATTEMPTS`, `DELIVERED_CODE_RESEND_SECONDS`, `DELIVERED_CODE_TTL_MS`, `armDeliveredCode`, `clearDeliveredCode`, `consumeDeliveredCode`, `deliveryCooldownRemaining`, `generateDeliveredCode`, `hashDeliveredCode`. Time-limited one-time codes (e.g. emailed/SMS codes) with attempt limits, TTL, and resend cooldown.
- **From `./totp`** — `buildOtpauthUri`, `decryptTotpSecret`, `encryptTotpSecret`, `verifyTotpCode`, `TotpVerification`. TOTP secret encryption/decryption, `otpauth://` URI construction, and code verification.

## Relationships

- **`./registry`**, **`./backup-codes`**, **`./delivered-codes`**, **`./totp`** — This file is a pure re-export of every public symbol from these four siblings. It contains no logic of its own.
- **`src/modules/account/services/two-factor.ts`** — The service layer imports the registry API (`twoFactorMethod`, `orderedEntries`, etc.) through this barrel to drive enrollment/verification flows.
- **`src/modules/account/tests/unit/two-factor.test.ts`** and **`src/modules/account/tests/integration/two-factor.test.ts`** — Test suites import the crypto helpers (backup-codes, delivered-codes, TOTP) directly via this barrel, per the module doc comment.

## Notes

- This file is a zero-logic barrel: no side effects, no conditional exports, no default export. Deleting or renaming a sub-module symbol requires updating this file or the build will fail.
- The module-level JSDoc explicitly frames this as the public surface that both the service layer *and* the test/recovery code consume—add new sub-modules here if they should be part of the same public API.
