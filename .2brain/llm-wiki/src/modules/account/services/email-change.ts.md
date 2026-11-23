---
source: src/modules/account/services/email-change.ts
source_sha256: 5ad99bf80b644b038065c78c6657421ac6f3111b3edb944f9bc3fa6be5cf704d
context_sha256: ca7633ec66c83ba203c7a09d0a2eaa05fd475a8d788657341ee36c30e26f8370
generated_at: 2026-11-22T03:36:11.419669+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/email-change.ts

## Purpose
Implements requesting and cancelling an email change (`POST` / `DELETE /account/email-change`). A requested address is parked as `pendingEmail` and never replaces `email` until confirmed. The state-transition rules live in `../domain/email-change`, and confirming or undoing a change is handled in `./verification`.

## Key elements
- `requestEmailChange(userId, requestedEmail, context)` — the `POST` handler, run inside `withOwnAccount`. Checks run in this order:
  - Same as the current address: 409 `EMAIL_ALREADY_CURRENT`.
  - Same as the pending address: 409 `EMAIL_CHANGE_ALREADY_PENDING`, with nothing mailed.
  - Held by another account (as `email` or `pendingEmail`): 409 `EMAIL_ALREADY_USED`.
  - Otherwise it calls `saveRequestedEmail`.
  - DB errors go through `rejectDatabaseEnvelope('auth', …)`. Success returns 200 with the user.
- `saveRequestedEmail` (internal) — applies the resend cooldown first (429 `EMAIL_CHANGE_TOO_SOON`), then the mailbox budget check (`mailRecipientRefusal`). If both pass, it calls `setPendingEmail` and `notifyEmailChangeRequested`.
- `cancelPendingEmailChange(userId, context)` — the `DELETE` handler. It loads the user with `pendingEmail` and returns 401 if the user is missing. It then calls `cancelPendingEmail`, and the call is a no-op when nothing was pending.
- `revokeCanceledChange` (internal) — only if a change was actually pending (`emailChangeNext(..., 'cancel')` is defined), removes the `email-change` token and records the `AUTH_EMAIL_CHANGE_CANCELED` audit event.
- `sendEmailChangeMail` (internal) — issues an undo token (`EMAIL_CHANGE_UNDO_TOKEN_TYPE`, TTL `EMAIL_CHANGE_UNDO_TTL_MS`). It mails a notice with the undo link to the OLD address, then sends the verification email to the new one via `sendVerificationEmail`.
- `notifyEmailChangeRequested` (internal) — sends both mails, then records `AUTH_EMAIL_CHANGE_REQUESTED`.
- `alreadyHeld` (internal) — builds the localized 409 reject using `t(messageKey)`.

## Relationships
- `@infrastructure/http/response` supplies `generateSuccess` and `generateReject`. `@infrastructure/http/errors` supplies `rejectDatabaseEnvelope`.
- `@infrastructure/persistence/normalize-email` supplies `normalizeEmail`, used for the current and pending comparisons.
- `../domain` supplies `emailChangeNext` and `emailChangeStateOf`, used to decide whether `cancel` applies.
- `./caller` supplies `withOwnAccount`.
- `../cooldown` supplies `resendTooSoon`. `./verification` supplies `resendCooldownRemaining` and `sendVerificationEmail`.
- `../mail-budget` supplies `mailRecipientRefusal`.
- `../emails` supplies the notice email template and the locale and name helpers.
- `../audit` supplies `accountAuditActions`, and `@infrastructure/observability/audit` supplies `recordAudit`.
- `@infrastructure/i18n` supplies `t` for the 409 and 429 messages.
- `./tokens`, `./mail`, `../token-types`, `@modules/users`, `@api/error-codes` and `@types` are also imported by this file.

## Notes
- The collision check at request time is only half the rule. The unique indexes `users_pending_email` and `users_email` enforce it at swap time, since the two steps can be up to 24 hours apart.
- The cooldown check runs before the mailbox budget check, so a paced request spends no budget. The budget refusal happens before the save, so `pendingEmail` is left unchanged.
- Both mails are awaited rather than fire-and-forget, to avoid racing token issuance with the client's next action.
- A new request replaces the previous undo token, so only the newest undo link is live.
- The audit event for a request is recorded after the mail is sent, not after the write.
- Cancel is explicit only. Re-requesting the current address never cancels as a side effect.
