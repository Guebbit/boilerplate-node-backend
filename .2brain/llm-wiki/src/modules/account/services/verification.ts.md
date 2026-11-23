---
source: src/modules/account/services/verification.ts
source_sha256: dc591e76439375a0c9e58a8b18f44bfd9fadf473768ff08a2493a0829b2db577
context_sha256: 07ac212612569ee3ac7360d72ae5115bbad09e7709ebbbfcb5377cd1af4dab00
generated_at: 2026-11-22T03:44:19.386700+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/verification.ts

## Purpose
Single place where email-verification tokens are issued and the verification mail is queued. Two kinds of verification share it: proving the account's existing address (signup, explicit re-send) and proving the pending address of an email-change request. Every flow that starts either one goes through here so they cannot drift. Issuing a token atomically replaces the previous token of the same kind, so only the newest email works.

## Key elements
- `VERIFY_RESEND_SECONDS` (60) – minimum gap between verification emails for one account; the value clients count down on their Resend button.
- `VerifyLinkType` (internal) – union of `EMAIL_VERIFY_TOKEN_TYPE` and `EMAIL_CHANGE_TOKEN_TYPE`.
- `VERIFICATION_TARGETS` (internal) – maps each token kind to the frontend route (`verify` / `email-change`) and the address it proves (`user.email` / `user.pendingEmail`).
- `sendVerificationEmail(user, context, type?)` – issues a token (TTL from `accountConfig().NODE_EMAIL_VERIFY_TTL_MS`), builds the mail in the recipient's locale via `verifyRequestEmail`, and queues it through `sendAccountMail` with `urgent: true`. Resolves without doing anything if the target address is missing. Defaults to the signup/re-send kind.
- `requestEmailVerification(user, context)` – wraps `sendVerificationEmail` and records the `AUTH_EMAIL_VERIFY_REQUESTED` audit action. Kept separate so signup and email-change sends are not audited as user requests.
- `resendCooldownRemaining(user, type)` – seconds left before another send, anchored on the live token's `sentAt`; 0 if a send may proceed.
- `pacedSend` (internal) – shared re-send pacing: cooldown first, then the recipient mailbox budget, then the send.
- `requestEmailVerificationFor(userId, context)` – the `POST /account/email-verification/resend` flow. Returns 404 if the user is missing and 409 (`EMAIL_ALREADY_VERIFIED`) if already verified. Otherwise it paces and sends, returning `{ resendAfter: 60 }`.
- `resendPendingEmailVerificationFor(userId, context)` – the `POST /account/email-change/resend` flow. Mails only the pending address. If no change is pending it returns `{ resendAfter: 0 }` and sends and audits nothing. On success it audits `AUTH_EMAIL_CHANGE_RESENT`.
- The file also documents a function that marks the account's address proven by setting `verifiedAt` on the document without saving, so the caller's own `save` persists it. Its only caller is `password-reset.ts#markResetCompleted`, which passes it as `beforeSave` to `passwordWrite`, so verification lands in the same write as the new password.

## Relationships
- `./tokens` (imported, not a listed neighbor) supplies `issueToken`, `tokenSentAt`, and other token helpers. Token type constants come from `../token-types`.
- `src/modules/account/services/mail.ts` (`sendAccountMail`) queues the mail. `src/modules/account/emails.ts` supplies `verifyRequestEmail`, `recipientLocale` and `greetableName`.
- `src/modules/account/config.ts` provides `accountConfig()` for the link TTL.
- `src/modules/account/cooldown.ts` provides `cooldownRemaining` and `resendTooSoon`. `src/modules/account/mail-budget.ts` provides `mailRecipientRefusal`, the per-recipient budget check.
- `src/modules/account/services/caller.ts` provides `withOwnAccount` (used by the email-change resend) and `recordAccountAudit`.
- `src/modules/account/domain/index.ts` provides `emailChangeNext` and `emailChangeStateOf`, used to decide whether a resend is valid for the current email-change state. It also exports `undoRestoresPreviousEmail`. `src/modules/account/domain/email-change.ts` is a related neighbor.
- `src/infrastructure/observability/audit.ts` provides `recordAudit`. `src/modules/account/audit.ts` provides `accountAuditActions`.
- `src/infrastructure/http/response.ts` provides `generateSuccess` and `generateReject` for the response envelopes.
- `src/infrastructure/i18n/index.ts` provides `t` for localized messages. `src/infrastructure/i18n/context.ts` is also a neighbor, but its interaction is not visible in the shown portion of this file.
- `accountUserService` (`@modules/users/friends/account`) loads the user with credentials.

## Notes
- The cooldown is enforced in the service, not only in the route limiter. The credential limiters skip successful requests, so a successful send would otherwise spend no budget even though each one publishes mail.
- The resend flow returns an honest 409 for an already-verified account. There is no enumeration concern because the caller is authenticated and asking about their own account.
- The 60 s cooldown is longer than the 2FA code's 30 s because a verification link stays valid for the configured TTL.
- Several imports (`redeemLiveToken`, `spendThen`, `refuseLink`, `revokeFor`, `EMAIL_CHANGE_UNDO_TOKEN_TYPE`, `undoRestoresPreviousEmail`, `recordAccountAudit`) are not used in the visible part of the file. They are presumably used further on.
