---
source: src/modules/account/services/verification.ts
sha256: 65ccf926a030d9f26f76d3a0e8aef518d49afe675cf0345ba126ed2ba4f26d4d
generated_at: 2026-10-29T02:46:48.758472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/verification.ts

## Purpose

Centralises email verification — issuing a token and queueing the mail — so that every flow that needs a "prove this mailbox" link (signup re-send, explicit user re-send, email-change request, email-change re-send) goes through one code path and cannot drift. Also enforces the shared pacing (cooldown + per-recipient mail budget) that every re-send must pass before a send is permitted.

## Key elements

- **`sendVerificationEmail(user, context, type?)`** — Core primitive: issues a token (replacing the same-kind previous one atomically), builds the localised mail body, and enqueues it via `sendAccountMail`. Used by every verification flow.
- **`requestEmailVerification(user, context)`** — Wraps `sendVerificationEmail` and adds the `AUTH_EMAIL_VERIFY_REQUESTED` audit record. Intended only for the explicit user-facing re-send, not for signup side-effects.
- **`resendCooldownRemaining(user, type)`** — Returns seconds (or 0) until the next send of `type` is allowed, anchored on the live token's `sentAt`.
- **`pacedSend(user, type, recipient, context, send)`** *(internal)* — Enforces cooldown first, then `mailRecipientRefusal`, and only then invokes `send`. Shared by both re-send endpoints.
- **`requestEmailVerificationFor(userId, context)`** — Full `POST /account/email-verification/resend` handler: loads the account, refuses 404/409, runs `pacedSend`, records audit, returns `200 { resendAfter }`.
- **`resendPendingEmailVerificationFor(userId, context)`** — Full `POST /account/email-change/resend` handler: no-op (returns `resendAfter: 0`) when no change is pending; otherwise mails the **pending** address and records `AUTH_EMAIL_CHANGE_RESENT`.
- **`VERIFY_RESEND_SECONDS`** — Exported constant (60) the client uses for its countdown.
- **`VerifyLinkType`** — Closed union of `EMAIL_VERIFY_TOKEN_TYPE | EMAIL_CHANGE_TOKEN_TYPE`; a third type cannot be passed.
- **`VERIFICATION_TARGETS`** *(internal)* — Maps each token type to its frontend route (`'verify'` / `'email-change'`) and the user property holding the target address.
- **`emailVerifyTokenTtlMs()`** *(internal)* — Reads `NODE_EMAIL_VERIFY_TTL_MS` from `accountConfig()` so the TTL is a deployment-level knob.
- **Mark-verified helper** *(truncated in source)* — Sets `verifiedAt` on the document (unpersisted); wired as `beforeSave` in `completePasswordReset` and used by `completeEmailVerification` / `completeEmailChange` so a spent reset token and a spent verify token land in the same write.

## Relationships

- **`../config`** (`accountConfig`) — Supplies the token TTL.
- **`../emails`** (`verifyRequestEmail`, `recipientLocale`, `greetableName`) — Builds the localised mail body and recipient display name.
- **`./tokens`** (`issueToken`, `tokenSentAt`, `redeemLiveToken`, `refuseLink`) — Token lifecycle: issue replaces the same-kind prior token; `tokenSentAt` anchors the cooldown.
- **`./mail`** (`sendAccountMail`) — Enqueues the verification email to the worker.
- **`./revocation`** (`revokeFor`) — Revokes prior links when a new token is issued (imported, used in the token-issuance path).
- **`../cooldown`** (`cooldownRemaining`, `resendTooSoon`) — Computes remaining wait and formats the "too soon" reject.
- **`../mail-budget`** (`mailRecipientRefusal`) — Per-recipient budget check; refusal is charged to the caller.
- **`../domain`** (`emailChangeNext`, `emailChangeStateOf`, `undoRestoresPreviousEmail`) — State-machine guard for whether an email change is pending and re-sendable.
- **`./caller`** (`withOwnAccount`, `recordAccountAudit`) — Loads the caller's own document and provides the audit-recording helper.
- **`../audit`** (`accountAuditActions`) — Named audit actions recorded on each re-send.
- **`@infrastructure/i18n`** (`t`) — Localised user-facing error/success strings.
- **`@infrastructure/http/response`** (`generateSuccess`, `generateReject`) — HTTP response constructors.
- **`@infrastructure/observability/audit`** (`recordAudit`) — Emits audit events.
- **`./index`** — Re-exports the public functions of this module.

## Notes

- **Two token kinds, one mechanism.** `EMAIL_VERIFY_TOKEN_TYPE` proves `user.email`; `EMAIL_CHANGE_TOKEN_TYPE` proves `user.pendingEmail`. The `VERIFICATION_TARGETS` map is the single source of truth binding type → route → address, preventing a mismatch between the token kind and the mailbox it targets.
- **Cooldown is enforced in the service, not only the route limiter.** `credentialLimiters` skips successful requests (correct for login, wrong here because a *successful* re-send is the expensive operation — it publishes mail).
- **Email-change re-send mails only the pending address.** The old address is intentionally not re-notified; a second mail to it would read like a takeover alert.
- **`requestEmailVerificationFor` returns an honest 409** for already-verified accounts rather than a silent 200, because the caller is authenticated and asking about their own account (no enumeration surface to hide).
- **The mark-verified helper mutates `verifiedAt` but does not persist.** The caller's own `save` (e.g. `completePasswordReset`'s `beforeSave`) covers the write, so a reset-token spend and a verify-token spend land in the same DB transaction.
