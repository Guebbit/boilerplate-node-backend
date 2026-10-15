---
source: src/modules/account/services/two-factor-enrollment.ts
sha256: a736bebb25b5850d6a5eee0b2e55ece5c1c180b4b594532cfd2e4948527500ed
generated_at: 2026-10-15T10:03:59.626399+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-enrollment.ts

## Purpose

Orchestrates the full lifecycle of second-factor methods on an account: status query, enrollment setup, code delivery, confirmation/arming, and removal. It owns the security invariants around each step (fresh-auth preconditions, code verification, delivery cooldowns, disarming-before-restart) and delegates method-specific rules to the handler registry in `../two-factor`.

## Key elements

- **`entryFor`** – Returns the account's `TwoFactorMethodRecord` for a method, creating an empty entry if absent. Reads back the last element of the Mongoose array so the handler mutates the hydrated subdocument.
- **`twoFactorStatus`** – `GET /account/2fa`. Returns armed methods (with `enrolledAt`), eligible-but-not-yet-enrolled methods, and the remaining backup-code count.
- **`setupTwoFactorMethod`** – `POST …/setup`. Starts or restarts enrollment for one method. First factor needs only fresh password; any subsequent change requires a valid factor/backup code via `verifyArmedFactor`.
- **`beginSetup`** *(internal)* – Enforces the delivery cooldown, disarms the prior entry (`enrolledAt = undefined`, clears delivered code), then calls `handler.setup`.
- **`sendMethodCode`** – `POST …/send`. Delivers a code to a signed-in caller for an already-armed delivered method; audit-logged.
- **`confirmTwoFactorMethod`** – `POST …/confirm`. Verifies the presented code against the pending entry, arms the method, and fires change notification; audit-logged.
- **`armMethod`** *(internal)* – Sets `enrolledAt`, persists via `persistTwoFactorWrite` (conditionally mints backup codes), marks sessions ended, and revokes existing sessions.
- **`removeTwoFactorMethod`** – `DELETE …/methods/{method}`. Drops one armed factor; removing the last one turns 2FA off entirely.

## Relationships

- **`../two-factor` (index)** – Provides `twoFactorMethod`, `availableTwoFactorMethods`, `deliveryCooldownRemaining`, and the `TwoFactorMethodHandler` type; also re-exports `generateBackupCodes`, `generateBackupCodeSalt`, `hashBackupCodes` (from `backup-codes.ts`) and `clearDeliveredCode` (from `delivered-codes.ts`).
- **`./two-factor-outcomes`** – Supplies shared outcome helpers: `armedEntries`, `audited`, `deliverArmedCode`, `notifyChange`, `tooSoon`, `rejectWrongCode`, `summarize`.
- **`./two-factor-lockout`** – Supplies `verifyArmedFactor`, `settleVerdict`, `withVerifiedCode` for the "prove a factor before changing factors" path.
- **`./caller`** – `withOwnAccount` wraps every mutation to load and lock the caller's own user document.
- **`./revocation`** – `revokeFor('two-factor-change', …)` tears down existing sessions after a confirm write.
- **`../audit`** – `accountAuditActions` enum values used with `audited` for `AUTH_2FA_CODE_SENT` and `AUTH_2FA_ENROLLED`.
- **`@infrastructure/http/response` / `errors`** – `generateSuccess`/`generateReject` for shaping replies; `rejectDatabaseEnvelope` as the catch-all error mapper.
- **`@infrastructure/i18n`** – `t()` for all user-facing error strings.
- **`./index`** – Barrel re-export so routes import from the services namespace.

## Notes

- **Mongoose subdocument hydration:** `entryFor` deliberately reads back `user.twoFactorMethods.at(-1)` after pushing, because handlers that mutate the entry need the hydrated subdocument, not the plain object that was pushed.
- **Disarm-before-setup invariant:** `beginSetup` clears `enrolledAt` and the delivered code *before* calling `handler.setup`, so a mid-flight failure cannot leave a stale armed secret next to a new pending one.
- **Backup-code minting condition:** Codes are minted when `twoFactorBackupCodes.length === 0`, *not* when "this is the first factor." After a re-enrollment or the tenth code being spent, the distinction matters. The response only returns the clear codes if the stored salt matches this request's salt (guards against two concurrent first-confirms).
- **Derived armed flag:** `twoFactorEnabledAt` is set as a side-effect of `persistTwoFactorWrite`, not directly in this file; an abandoned "I lost my phone" attempt that never confirms leaves the flag untouched.
- **Session revocation is atomic with the write:** `markSessionsEnded` and `revokeFor` run inside the same persistence flow so a second-write failure cannot leave old sessions alive.
- Method-specific rules (what codes look like, how delivery works, eligibility) live in `../two-factor/registry`; this file only enforces *when* and *under what auth* those rules may be invoked.
