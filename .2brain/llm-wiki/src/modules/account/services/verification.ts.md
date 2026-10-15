---
source: src/modules/account/services/verification.ts
sha256: c449a07d79db2521cf832509a27389257014f130840117b6158c4b2976e1eb22
generated_at: 2026-10-15T10:05:12.631369+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/verification.ts

## Purpose

Centralises email-verification for two flows—proving an account's existing address (signup / explicit re-send) and proving a pending address requested via `PUT/PATCH /account`—so that token issuance, email composition, cooldown pacing, and audit logging all live in one place and cannot drift. Every verification flow in the codebase calls into this module and nothing else.

## Key elements

- **`VERIFY_RESEND_SECONDS`** (const, 60) — cooldown between two verification emails for the same account; returned to the client so it can drive a countdown button.
- **`VerifyLinkType`** (type) — strict union of `EMAIL_VERIFY_TOKEN_TYPE | EMAIL_CHANGE_TOKEN_TYPE`; prevents a third token kind from slipping in.
- **`VERIFICATION_TARGETS`** (const map) — maps each link type to its frontend route (`'verify'` vs `'email-change'`) and the address-extraction function (`user.email` vs `user.pendingEmail`).
- **`sendVerificationEmail`** (exported) — the core primitive: issues a token (atomically replacing the prior one of the same kind), composes a localised email, and enqueues it via `sendAccountMail`. Returns when the job is queued.
- **`requestEmailVerification`** (exported) — wrapper around `sendVerificationEmail` that adds an `AUTH_EMAIL_VERIFY_REQUESTED` audit record; used only for the explicit user-initiated re-send, not for signup or email-change side effects.
- **`resendCooldownRemaining`** (exported) — reads the live token's `sentAt` and returns seconds still to wait before another send of that kind is permitted.
- **`pacedSend`** (private) — shared pacing pipeline: cooldown check → per-recipient mailbox-budget check → actual send. Used by both public handlers.
- **`requestEmailVerificationFor`** (exported) — full `POST /account/verify-request` handler: loads the user, rejects 404/409 (already verified), runs `pacedSend`, and returns `resendAfter`.
- **`resendPendingEmailVerificationFor`** (exported) — full `POST /account/pending-email/resend` handler: no-ops gracefully when nothing is pending; otherwise mails only the pending (new) address and audits `AUTH_EMAIL_CHANGE_RESENT`.
- **Truncated export (likely `markEmailVerified` or similar)** — sets `verifiedAt` on the document and calls `promoteVerifiedCustomer` to move the role from `unverified` to `customer` in the same step.

## Relationships

- **`@infrastructure/http/response`** — builds all `ResponseSuccess` / `ResponseReject` return values via `generateSuccess` and `generateReject`.
- **`@infrastructure/i18n`** — localises every user-facing string through `t()`.
- **`@infrastructure/observability/audit`** — records audit entries via `recordAudit` with actions sourced from `../audit`.
- **`../config`** (`accountConfig`) — supplies `NODE_EMAIL_VERIFY_TTL_MS` for token lifetime.
- **`../cooldown`** — provides `cooldownRemaining` and `resendTooSoon` helpers used inside `pacedSend`.
- **`../domain`** (incl. `email-change.ts`) — `emailChangeNext`, `emailChangeStateOf`, and `undoRestoresPreviousEmail` drive the pending-email state machine.
- **`../emails`** — `verifyRequestEmail`, `recipientLocale`, `greetableName` compose the outgoing mail body.
- **`@modules/access`** — calls `promoteVerifiedCustomer` to perform the role-promotion side effect on successful verification.
- **`@kernel/access/tenant`** — imports `DEPLOYMENT_TENANT_ID` (tenant-scoped guard in the promotion path).
- **`../audit`** — supplies the `accountAuditActions` enum used as audit action keys.
- **`src/modules/account/controllers/post-signup.ts`** (caller) — invokes `sendVerificationEmail` as a side effect of signup; does not audit it as a "request."

## Notes

- **Atomic replacement, not security.** Re-issuing a token of the same kind replaces the previous one so the user always has exactly one working link. The comment explicitly states this is a UX guarantee, not a security boundary, because spending *any* token of that kind proves the same mailbox.
- **Cooldown is enforced at the service layer, not only by middleware.** `credentialLimiters` sets `skipSuccessfulRequests`, so a 200 response consumes no rate-limit budget. That is correct for login guesses but wrong here, where the success path *is* the expensive operation (sending mail). Hence `pacedSend` checks cooldown before calling `send`.
- **Email-change resend mails only the new address.** The old address is intentionally not re-notified on resend to avoid it reading as a takeover alert to the legitimate holder.
- **Already-verified → honest 409.** Because the caller is authenticated and acting on their own account, an already-verified state returns a `409` rather than a soothing `200` that silently re-sends nothing.
- **The role-promotion write is asynchronous** (membership change, not a document field), so the verify-completion function is inherently async even though `verifiedAt` itself could be set synchronously.
