---
source: src/modules/users/services/credentials.ts
sha256: 2df2353c697c7d686b714363dae7356bd93821671a90cf8b1023f976354a83ee
generated_at: 2026-10-15T12:10:18.456210+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/credentials.ts

## Purpose

Write-side credential mutations for the shared kernel. Each exported function is a single, narrow atomic write (or no-op) against a user document—setting passwords, stamping verification, swapping emails, persisting 2FA state, and spending/record-ing delivered codes. The file intentionally handles *only* the document-level write; account-level side effects (role promotion, token revocation, session-ending policies) are the caller's responsibility.

## Key elements

- **`setPassword`** – Sets `user.password` and saves via `userRepository.save`.
- **`markSessionsEnded`** – Advances `tokensValidAfter` on the loaded doc (never backwards) so the caller's subsequent `save` carries the new epoch atomically.
- **`markEmailVerified`** – Stamps `verifiedAt = new Date()` and saves.
- **`applyEmailChange`** – Swaps `pendingEmail` → `email`, records `previousEmail`, stamps `verifiedAt`, calls `markSessionsEnded`, saves.
- **`restorePreviousEmail`** – Reverts `email` to `previousEmail`, clears both `previousEmail` and `pendingEmail`, saves.
- **`cancelPendingEmail`** – Clears `pendingEmail` and saves; safe no-op if already empty.
- **`markInactivityWarned`** – Stamps `inactivityWarnedAt`, saves.
- **`persistTwoFactorWrite`** – Plans a 2FA write via `planTwoFactorWrite`, skips empty writes, executes `userRepository.writeTwoFactor`, then `adoptOutcome` syncs the result back onto the loaded copy. Throws `DocumentNotFoundError` on a lost race.
- **`persistTwoFactorMethods`** – Convenience wrapper: calls `persistTwoFactorWrite` with `{ dropped }` and returns the settled `user`.
- **`armReauthCode`** – Writes step-up code fields via `userRepository.armReauthCode`; calls `unmarkModified('reauthCode')` on success.
- **`spendDeliveredCode`** – Atomically spends a code via the repository; on success mirrors the spent state onto the loaded copy via `mirrorSpentCode`. Returns `false` if already spent/expired/replaced.
- **`recordDeliveredMiss`** – Increments the wrong-guess counter for a code slot via the repository.
- **`clearDeliveredCode`** – Sets all `DELIVERED_CODE_FIELDS` on a loaded entry to `undefined`.
- **`adoptOutcome`** (private) – Copies `enabledAt` / backup-code state from the write outcome back onto the loaded doc; calls `settleTwoFactorWrite`.
- **`mirrorSpentCode`** (private) – Clears the spent code's fields on the loaded copy and marks the entry written.

## Relationships

- **`src/modules/users/model.ts`** – Source of `UserDocument`, `DeliveredCodeSlot`, `DeliveredCodeState`, `MfaReservation` types and the `DELIVERED_CODE_FIELDS` constant.
- **`src/modules/users/repository.ts`** – All persistence funnels through `userRepository` (`save`, `writeTwoFactor`, `spendDeliveredCode`, `recordDeliveredMiss`, `armReauthCode`).
- **`src/modules/users/two-factor-write.ts`** – Provides `planTwoFactorWrite`, `settleTwoFactorWrite`, `isEmptyWrite`, `markEntryWritten`, and the `TwoFactorWriteOptions` / `TwoFactorWriteOutcome` types used by `persistTwoFactorWrite`.
- **`src/modules/account/services/two-factor-enrollment.ts`** – Primary caller of `persistTwoFactorMethods`; every enrollment, confirmation, removal, disable, and backup-code action ends with that call.
- **`src/modules/users/services/index.ts`** – Barrel that re-exports this module's public API.
- **`src/modules/users/services/remove.ts`** / **`update.ts`** – Sibling services that invoke `markSessionsEnded` before their own saves to end sessions in the same write.
- **`src/modules/users/tests/unit/mark-sessions-ended.test.ts`** – Unit tests for the monotonic epoch-advance logic.

## Notes

- **Document-only contract.** This file never promotes roles, revokes refresh tokens, or sends notifications. The caller (`account/services/*`) owns those side effects; the docblocks explicitly state the split.
- **Concurrency safety for 2FA.** `persistTwoFactorWrite` uses a per-method atomic update so a stale in-memory copy cannot undo a concurrent write (e.g., a claimed TOTP step). The "armed" flag is *derived by the database* from stored entries, not read from the in-memory copy.
- **Lost-race signal.** A missing document surfaces as `MongooseError.DocumentNotFoundError`, which the caller recognises via an `isLostRace` guard—identical to what a plain `save` would throw.
- **`markSessionsEnded` is monotonic.** It only moves `tokensValidAfter` forward; passing an older date is a silent no-op.
- **Empty-write short-circuit.** `persistTwoFactorWrite` returns immediately from the in-memory copy when `isEmptyWrite` is true, avoiding a round-trip.
