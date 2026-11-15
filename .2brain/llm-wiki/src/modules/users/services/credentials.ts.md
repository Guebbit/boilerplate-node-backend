---
source: src/modules/users/services/credentials.ts
sha256: 5ba7ab6585776d1fa1dc2ed537205e67925b9ebf275d15b26d9ad862cc26145c
generated_at: 2026-11-14T22:27:53.475286+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/credentials.ts

## Purpose

Write-side service for user account credentials. Provides one narrow, single-purpose mutation per operation (set password, verify email, swap email, persist 2FA, end sessions, etc.). Each function takes an already-loaded `UserDocument` and performs exactly one save or update, deliberately leaving validation, orchestration, and follow-up side-effects (role promotion, link purging, session-row deletion) to the caller.

## Key elements

- **`clearDeliveredCode(entry)`** — Undefines all `DELIVERED_CODE_FIELDS` on an in-memory `DeliveredCodeState` (post-spend or pre-re-arm reset). No save.
- **`setPassword(user, password, session?)`** — Assigns `password` and saves. Detects via `NOT_AN_EDIT_PATHS` whether the write is a profile edit (re-stamps `verifiedAt`, on the wire) or a plain credential change (off the wire), routing to `save` vs `saveWithoutEdit` so a plain change doesn't 412 an open form.
- **`markSessionsEnded(user, at?)`** — Moves `tokensValidAfter` forward (never backward) on the in-memory document; the caller's subsequent save persists it atomically with the credential change.
- **`markEmailVerified(user, session)`** — Stamps `verifiedAt` and saves. Does **not** promote role (`unverified → customer`); that is the caller's job.
- **`applyEmailChange(user, newEmail, session)`** — Swaps `pendingEmail` → `email`, clears `pendingEmail`, stamps `verifiedAt`, ends sessions, and saves with a `USER_PROFILE_CHANGED` outbox row via `announceWithin`.
- **`restorePreviousEmail(user, session)`** — Reverts `email` to `previousEmail`, clears both `previousEmail` and `pendingEmail`, saves with the same outbox row. Does not re-stamp `verifiedAt` (address was already proven).
- **`cancelPendingEmail(user, session?)`** — Clears `pendingEmail`; safe no-op when nothing is pending.
- **`setPendingEmail(user, email)`** — Parks a requested address as `pendingEmail`; never touches `email`.
- **`markInactivityWarned(user)`** — Stamps a "warned" timestamp so the inactivity reaper doesn't warn twice.
- **`persistTwoFactorWrite(user, options?)`** — Plans a 2FA write via `planTwoFactorWrite`; if empty, resolves from the copy. Otherwise calls `userRepository.writeTwoFactor`, adopts the outcome onto the in-memory document (`adoptOutcome`), and returns the stored outcome. Throws `DocumentNotFoundError` on missing account so `isLostRace` recognises it.
- **`persistTwoFactorMethods(user, dropped?)`** — Convenience wrapper: calls `persistTwoFactorWrite` with `{ dropped }`, returns the settled `user`.
- **`NOT_AN_EDIT_PATHS`** (module-private) — Set of paths (`password`, `mfaFailures`, `mfaLockedUntil`) whose change does not count as a profile edit.
- **`saveAnnouncingEmail`** (module-private) — Saves a user inside a caller's transaction while writing a `USER_PROFILE_CHANGED` outbox row via `announceWithin`.
- **`adoptOutcome`** (module-private) — Copies the database's post-write state (enabled-at, backup codes/salt) back onto the in-memory document and calls `settleTwoFactorWrite`.

## Relationships

- **`src/kernel/outbox.ts`** — Calls `announceWithin` to write outbox rows (`USER_PROFILE_CHANGED`) inside the caller's Mongoose transaction, since Mongoose does not nest transactions.
- **`src/modules/users/model.ts`** — Imports `DELIVERED_CODE_FIELDS` and the types `DeliveredCodeSlot`, `DeliveredCodeState`, `MfaReservation`, `UserDocument`.
- **`src/modules/users/events.ts`** — Imports the `USER_PROFILE_CHANGED` event name for outbox rows.
- **`src/modules/users/repository.ts`** — Uses `userRepository` for all saves, `writeTwoFactor`, `markInactivityWarned`, and `saveWithoutEdit`.
- **`src/modules/users/two-factor-write.ts`** — Imports `isEmptyWrite`, `markEntryWritten`, `planTwoFactorWrite`, `settleTwoFactorWrite`, and the `TwoFactorWriteOptions`/`TwoFactorWriteOutcome` types.
- **`src/modules/users/friends/account.ts`** — Referenced in docblocks as the orchestration layer that calls these functions (2FA enrollment, verification, email change) and owns the validation, role promotion, and link-purging steps.
- **`src/modules/users/services/index.ts`** — Re-export barrel for this module.
- **`src/modules/users/tests/unit/mark-sessions-ended.test.ts`** — Unit tests for `markSessionsEnded`.
- **`tests/integration/conditional-writes.test.ts`** — Integration tests exercising the conditional-write (412) path that `setPassword`'s edit-vs-non-edit distinction feeds into.

## Notes

- **One mutation per function.** The module docblock states the contract explicitly. If a new operation needs two saves, split it into two functions or lift to the caller.
- **No re-validation.** `setPassword` trusts that the caller already rejected weak/breached passwords. Adding a check here would duplicate logic owned by the "door" services.
- **`markSessionsEnded` is in-memory only.** It mutates the document so the caller's next `save` carries the epoch atomically with the credential write. Calling it without a subsequent save is a bug.
- **`previousEmail` guard for transaction retry.** In `applyEmailChange`, the `if (user.email !== newEmail)` check exists because the driver may re-execute a transaction; on replay `email` already equals `newEmail` and overwriting `previousEmail` would lose the undo target.
- **`DocumentNotFoundError` is thrown deliberately** (not just by Mongoose) in `persistTwoFactorWrite` so that `isLostRace` treats a concurrent delete the same as a vanished row.
- **Outbox is limited to email changes.** All other operations are document-only by design; do not add outbox rows here for non-email writes.
