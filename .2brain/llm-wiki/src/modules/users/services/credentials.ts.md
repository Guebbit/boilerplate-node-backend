---
source: src/modules/users/services/credentials.ts
sha256: cfb2c4b3ffb90cf0238204964df63b94b7d28386ef14006bbb79c7c025c1e6b3
generated_at: 2026-10-29T06:16:09.962281+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/credentials.ts

## Purpose

The write-side (mutation) layer for account credential operations. Each export is a single, narrow mutation applied to an already-loaded `UserDocument`; callers own validation, role promotion, session purging, and transaction boundaries. The file deliberately keeps "what changed" in the document and "what gets persisted" in the repository, so that a loaded copy always mirrors stored state after a write.

## Key elements

- **`clearDeliveredCode`** – Wipes every field in `DELIVERED_CODE_FIELDS` on a `DeliveredCodeState` entry (used after a spend or before re-arming).
- **`setPassword`** – Assigns a pre-validated password and saves via `userRepository.save`.
- **`markSessionsEnded`** – Advances `tokensValidAfter` on the document (never backwards); the caller's subsequent `save` carries the change.
- **`markEmailVerified`** – Stamps `verifiedAt` and saves. Does **not** promote role.
- **`saveAnnouncingEmail`** (module-private) – Saves an email change and enqueues a `USER_PROFILE_CHANGED` outbox event in the same transaction (GDPR Art. 19).
- **`applyEmailChange`** – Swaps `pendingEmail` → `email`, sets `previousEmail`, stamps `verifiedAt`, calls `markSessionsEnded`, then delegates to `saveAnnouncingEmail`.
- **`restorePreviousEmail`** – Reverts `email` to `previousEmail`, clears both pending fields, announces via outbox. Does not re-stamp `verifiedAt`.
- **`cancelPendingEmail`** – Clears `pendingEmail` and saves; safe no-op if nothing is pending.
- **`markInactivityWarned`** – Stamps `inactivityWarnedAt`; the only field this operation touches.
- **`persistTwoFactorWrite`** – Plans a 2FA write via `planTwoFactorWrite`; short-circuits if empty; otherwise calls `userRepository.writeTwoFactor` and mirrors the outcome back onto the document via `adoptOutcome`. Throws `DocumentNotFoundError` for a vanished account.
- **`persistTwoFactorMethods`** – Convenience wrapper around `persistTwoFactorWrite` with a `dropped` list; returns the settled `UserDocument`.
- **`armReauthCode`** – Writes the step-up code fields (`codeHash`, `codeExpiresAt`, `codeSentAt`, `codeAttempts`) via a targeted repository update that skips `updatedAt`/`editRevision`.
- **`spendDeliveredCode`** – Atomically consumes a delivered code (reauth or per-method); mirrors the spent state onto the loaded copy via `mirrorSpentCode`. Returns `false` on race, expiry, or attempt exhaustion.
- **`countWrongGuess`** *(truncated in source)* – Records a failed guess against the delivered-code entry.
- **`adoptOutcome`** (module-private) – Writes back `enabledAt`, backup-code digts/salt, and calls `settleTwoFactorWrite` so the copy matches the database.
- **`mirrorSpentCode`** (module-private) – After a successful spend, clears the relevant code fields and calls `markEntryWritten`.

## Relationships

- **`../model`** – Source of `UserDocument`, `DeliveredCodeSlot`, `DeliveredCodeState`, `MfaReservation` types and the `DELIVERED_CODE_FIELDS` constant that `clearDeliveredCode` iterates.
- **`../repository`** – All persistence goes through `userRepository` (`save`, `writeTwoFactor`, `armReauthCode`, `spendDeliveredCode`). This file never touches Mongoose collections directly.
- **`../two-factor-write`** – Provides the plan/empty-check/settle lifecycle (`planTwoFactorWrite`, `isEmptyWrite`, `markEntryWritten`, `settleTwoFactorWrite`) and the `TwoFactorWriteOptions` / `TwoFactorWriteOutcome` types consumed by `persistTwoFactorWrite` and `adoptOutcome`.
- **`../events`** – Imports the `USER_PROFILE_CHANGED` event name, embedded in the outbox payload for every email-address mutation.
- **`@kernel/outbox`** – `announceInTransaction` is the only way an outbox row is written; used exclusively by `saveAnnouncingEmail`.
- **`services/index.ts`** – Re-exports this module so that sibling services (`own-account`, `remove`, `activation`) can import credential mutations without deep paths.
- **`tests/unit/mark-sessions-ended.test.ts`** – Unit-tests the monotonic-epoch guarantee of `markSessionsEnded`.

## Notes

- **Load, don't fetch.** Every exported function receives the already-loaded `UserDocument`; a second fetch inside this module would be a redundant round-trip. Callers are responsible for finding and, where needed, spending a verification token before invoking these functions.
- **Armed flag is database-derived.** `persistTwoFactorWrite` does not let the caller set `twoFactorEnabledAt`; the repository computes it from the stored entries and returns it in the outcome. The copy adopts it via `adoptOutcome`.
- **Empty-write short-circuit.** If `planTwoFactorWrite` produces no changes, `persistTwoFactorWrite` resolves immediately from the in-memory copy—no DB round-trip, no outbox event.
- **`previousEmail` is the undo channel.** `applyEmailChange` stores the outgoing address there; `restorePreviousEmail` reads it back. It is the *only* copy of the old address once the swap commits.
- **`markSessionsEnded` is monotonic.** It guards against a stale `at` value regressing the epoch. Callers (e.g. `own-account`, `remove`) rely on this to ensure concurrent writes can't reopen an already-terminated session window.
- **GDPR coupling.** Every email-address change (`applyEmailChange`, `restorePreviousEmail`) emits a `USER_PROFILE_CHANGED` outbox event in the same transaction as the save; the webhook and the new address are atomic.
