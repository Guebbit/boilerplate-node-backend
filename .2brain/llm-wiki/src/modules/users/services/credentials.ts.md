---
source: src/modules/users/services/credentials.ts
sha256: cfb2c4b3ffb90cf0238204964df63b94b7d28386ef14006bbb79c7c025c1e6b3
generated_at: 2026-11-08T08:49:17.802841+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/credentials.ts

## Purpose

Write-side of the account domain: a set of narrow, single-purpose mutation functions that each perform exactly one atomic write to a user's credential fields (password, email, 2FA methods, reauth code, delivered codes). The file deliberately does **not** orchestrate role promotions, session purging, or link cleanup — those are the caller's job. Its contract is: take an already-loaded `UserDocument`, mutate the relevant fields, persist, and return.

## Key elements

- **`clearDeliveredCode(entry)`** — Sets every field in `DELIVERED_CODE_FIELDS` to `undefined` on a loaded code entry.
- **`setPassword(user, password, session?)`** — Assigns the pre-validated password and saves. Validation happens upstream in `passwordChange`.
- **`markSessionsEnded(user, at?)`** — Advances `tokensValidAfter` (never backwards) on the in-memory doc so the caller's own `save` carries the bump atomically with the credential change.
- **`markEmailVerified(user)`** — Stamps `verifiedAt` and saves. Role promotion (`unverified → customer`) is the caller's responsibility.
- **`applyEmailChange(user, newEmail)`** — Swaps `pendingEmail` into `email`, sets `verifiedAt`, calls `markSessionsEnded`, and saves with a `USER_PROFILE_CHANGED` outbox row in the same transaction. Stores the old address in `previousEmail` for the undo link.
- **`restorePreviousEmail(user)`** — Reverts to `previousEmail` (the undo action). Saves with the same outbox event. Throws a duplicate-key error if another account took the old address.
- **`cancelPendingEmail(user)`** — Clears `pendingEmail` and saves. No-op safe (idempotent).
- **`markInactivityWarned(user)`** — Stamps `inactivityWarnedAt` so the reaper job won't warn twice.
- **`persistTwoFactorWrite(user, options?)`** — Plans a 2FA delta via `planTwoFactorWrite`, sends an atomic `userRepository.writeTwoFactor` if non-empty, mirrors the outcome back onto the in-memory copy via `adoptOutcome`. Resolves immediately (no DB call) when the write is empty.
- **`persistTwoFactorMethods(user, dropped?)`** — Thin wrapper: calls `persistTwoFactorWrite` with `{ dropped }` and returns the settled `user`.
- **`armReauthCode(user)`** — Persists a step-up reauth code via a targeted `userRepository.armReauthCode`. Deliberately does **not** bump `updatedAt` or `editRevision`.
- **`spendDeliveredCode(user, slot, hash, maxAttempts, now?)`** — Atomically spends a delivered code (reauth or 2FA method). On success mirrors the spend onto the in-memory copy via `mirrorSpentCode`. Returns `false` if a parallel request already spent it or the code expired.
- **`recordWrongAttempt`** (truncated) — Records a failed code guess (attempt counter).
- **`saveAnnouncingEmail`** (internal, not exported) — Shared helper: saves the user and emits a `USER_PROFILE_CHANGED` outbox event in one transaction. Used by both `applyEmailChange` and `restorePreviousEmail`.
- **`adoptOutcome`** (internal) — Copies the database's 2FA write result back onto the in-memory doc (enabled-at, backup-code digest/salt, written markers) so a subsequent save won't overwrite it.
- **`mirrorSpentCode`** (internal) — Clears the spent code's fields on the loaded copy and calls `markEntryWritten` to prevent a later 2FA write from resending stale values.

## Relationships

- **`src/modules/users/two-factor-write.ts`** — Primary collaborator for all 2FA persistence. Imports `isEmptyWrite`, `markEntryWritten`, `planTwoFactorWrite`, `settleTwoFactorWrite`, and the `TwoFactorWriteOptions` / `TwoFactorWriteOutcome` types. The planning/settling logic lives there; this file only orchestrates the save.
- **`src/modules/users/repository.ts`** — All database I/O goes through `userRepository` (`save`, `writeTwoFactor`, `spendDeliveredCode`, `armReauthCode`). This file never touches Mongoose models directly.
- **`src/modules/users/model.ts`** — Source of `UserDocument`, `DeliveredCodeSlot`, `DeliveredCodeState`, `MfaReservation` types and the `DELIVERED_CODE_FIELDS` constant.
- **`src/kernel/outbox.ts`** — `announceInTransaction` is used inside `saveAnnouncingEmail` to emit the `USER_PROFILE_CHANGED` event atomically with the email save.
- **`src/modules/users/events.ts`** — Provides the `USER_PROFILE_CHANGED` event-name constant.
- **`src/modules/users/services/activation.ts`** — The caller that promotes `unverified → customer` after `markEmailVerified` or `applyEmailChange`; this file explicitly does not do the promotion.
- **`src/modules/users/services/own-account.ts`** — Primary caller of most exports here (password change, email change, 2FA enrollment, reauth arming, code spending).
- **`src/modules/users/tests/unit/mark-sessions-ended.test.ts`** — Unit-test coverage for the never-backwards invariant in `markSessionsEnded`.
- **`src/modules/users/services/index.ts`** — Barrel file that re-exports this module's public API to the rest of the service layer.

## Notes

- **One write, one concern.** The module docblock and every docstring reinforce that each function performs a single mutation. If you find yourself wanting to combine two, split into two calls in the service layer.
- **Document-only, by design.** `markEmailVerified`, `applyEmailChange`, and `restorePreviousEmail` intentionally skip role promotion, session-row purging, and link cleanup. Those side effects belong to the caller (e.g. `activation.ts`, `own-account.ts`).
- **`markSessionsEnded` is monotonic.** It will never lower `tokensValidAfter`. Callers can invoke it multiple times safely.
- **Empty-write short-circuit.** `persistTwoFactorWrite` checks `isEmptyWrite` *before* any DB call and resolves with the current in-memory values. Callers should not expect a round-trip for no-op 2FA changes.
- **Lost-race signalling.** Both `persistTwoFactorWrite` and `armReauthCode` throw `MongooseError.DocumentNotFoundError` when the account row is gone, so upstream `isLostRace` handlers catch both paths uniformly.
- **`previousEmail` is the undo anchor.** It is set by `applyEmailChange`, consumed and cleared by `restorePreviousEmail`, and cleared by `cancelPendingEmail`. Any new email-flow function must maintain this invariant.
- **`saveAnnouncingEmail` is private.** Email changes always emit a `USER_PROFILE_CHANGED` outbox row (GDPR Art. 19 webhook). Do not bypass it by calling `userRepository.save` directly for email mutations.
