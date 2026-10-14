---
source: src/modules/account/services/two-factor-enrollment.ts
sha256: 70b7ce86548c273b360e27f5035b9ebf8a03e5d12e83916bf58afe24285711c1
generated_at: 2026-10-14T08:55:50.475863+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-enrollment.ts

## Purpose

Orchestrates the full lifecycle of a user's second-factor methods: querying status, starting enrollment, delivering codes, confirming (arming) a method, and minting backup codes. It sits between the route layer and the per-method handlers in `../two-factor/`, enforcing auth gates (fresh password vs. an armed factor), cooldowns, and audit logging. The file owns *when* the account-level `twoFactorEnabledAt` flag flips; each method's own protocol (what to send, how to verify) lives in its handler.

## Key elements

- **`entryFor(user, method)`** *(private)* — Finds or appends the `TwoFactorMethodRecord` for a method on the user document. Reads back the last array element after a push because Mongoose hydrates it into a subdocument.
- **`twoFactorStatus(userId)`** *(exported)* — `GET /account/2fa`. Returns armed methods (with `enrolledAt`), eligible-but-unenrolled methods with their eligibility info, and remaining backup-code count.
- **`setupTwoFactorMethod(userId, method, code, context)`** *(exported)* — `POST …/setup`. Starts or restarts enrollment. Requires fresh password for the first factor; requires a verified armed factor (or backup code) once anything is already armed.
- **`beginSetup(user, handler, context)`** *(private)* — Disarms the method's entry, checks delivery cooldown, calls `handler.setup`, then persists.
- **`sendMethodCode(userId, method, context)`** *(exported)* — `POST …/send`. Delivers a one-time code for an already-armed delivered method so the user can prove identity before modifying factors.
- **`confirmTwoFactorMethod(userId, method, code, context)`** *(exported)* — `POST …/confirm`. Verifies the pending code via `handler.verify`, then arms the method. Mints backup codes (returned in the clear once) only if the account has none.
- **`armMethod(user, entry)`** *(private)* — Sets `enrolledAt`, persists the write (conditionally minting hashed backup codes), marks sessions ended, and revokes active sessions via `revokeFor`.

## Relationships

- **`@infrastructure/http/response`** — All functions return `generateSuccess` / `generateReject` envelopes.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope('auth', error)` wraps unexpected DB/async failures.
- **`@infrastructure/i18n`** — `t()` produces localized error messages for unknown methods, missing codes, cooldown, etc.
- **`../two-factor` (barrel: `two-factor/index.ts`)** — Supplies `twoFactorMethod` (handler lookup), `availableTwoFactorMethods`, `generateBackupCodes`, `hashBackupCodes`, `generateBackupCodeSalt`, `clearDeliveredCode`, `deliveryCooldownRemaining`, and the `TwoFactorMethodHandler` type. Backing modules: `backup-codes.ts`, `delivered-codes.ts`.
- **`./two-factor-outcomes`** — Reusable outcome helpers: `audited` (wraps a promise with an audit log), `notifyChange`, `rejectWrongCode`, `summarize`, `tooSoon`.
- **`./two-factor-lockout`** — `armedEntries` (filter to confirmed methods), `verifyArmedFactor` (check a code against an armed factor), `settleVerdict` (resolve a verification verdict), `withVerifiedCode`.
- **`../audit`** — `accountAuditActions` enum values passed to `audited` for `AUTH_2FA_CODE_SENT` and `AUTH_2FA_ENROLLED` events.
- **`./revocation`** — `revokeFor('two-factor-change', user.id)` kills live sessions when a factor is added or changed.

## Notes

- **Mongoose subdocument gotcha:** `entryFor` pushes a plain object then reads back `user.twoFactorMethods.at(-1)` because Mongoose replaces the literal with a hydrated subdocument. Reusing the original literal would mutate a detached copy.
- **Disarm-before-setup:** On a restart, `entry.enrolledAt` is cleared *before* `handler.setup` runs. If the handler fails, the old secret is already disarmed rather than coexisting with a stale pending one.
- **Backup-code minting is conditional on the account, not the method:** The first *armed* factor on an account with zero codes mints a set; a second factor never does. The condition is `user.twoFactorBackupCodes.length === 0`, not "is this the first entry."
- **Account flag is write-derived:** `twoFactorEnabledAt` is set inside `persistTwoFactorWrite` (the DB layer), not explicitly in this file. This file never writes the flag directly.
- **Cooldown nuance:** `beginSetup` skips the cooldown check for non-delivered methods (`handler.delivers ? … : 0`). A delivered method that was just verified to allow the restart has its cooldown already spent, so the check is still meaningful for subsequent sends.
- **File is the service-layer "glue":** it does not implement any factor-specific protocol (TOTP, SMS, etc.). That logic lives in the per-method handlers registered under `../two-factor/`.
