---
source: src/modules/account/services/verification.ts
sha256: 0f6a07348bf75cb8a83620febc0d7e9c6533707faf2512c0e6737fe72c05de39
generated_at: 2026-11-08T04:25:33.393768+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/verification.ts

## Purpose
Centralises email-verification token issuance and mail dispatch for the two flows that share the mechanism — proving the address an account already has (signup / explicit re-send) and proving the address a `PUT/PATCH /account` change has requested. Every flow that starts either kind calls the functions here and nothing else, so the two paths cannot drift.

## Key elements
- **`VERIFY_RESEND_SECONDS`** (60) — cooldown between two verification emails for one account; what the client's Resend button counts down.
- **`VerifyLinkType`** — union of `EMAIL_VERIFY_TOKEN_TYPE` and `EMAIL_CHANGE_TOKEN_TYPE`; a third type cannot be passed.
- **`VERIFICATION_TARGETS`** — maps each `VerifyLinkType` to its frontend route (`'verify'` | `'email-change'`) and the user-document field that holds the target address.
- **`sendVerificationEmail(user, context, type?)`** — issues a fresh token (atomically replacing the kind's previous one) and enqueues the verification mail. Resolves when the job is queued; actual send happens in the email worker.
- **`requestEmailVerification(user, context)`** — wraps `sendVerificationEmail` with an `AUTH_EMAIL_VERIFY_REQUESTED` audit record; used by the explicit `POST …/resend` route but *not* by signup or email-change side-effects.
- **`resendCooldownRemaining(user, type)`** — returns seconds left before another send of `type` is allowed (anchored on the live token's `sentAt`).
- **`requestEmailVerificationFor(userId, context)`** — end-to-end handler for `POST /account/email-verification/resend`: loads the caller's account, rejects 404 / 409-already-verified, enforces cooldown + mailbox budget via `pacedSend`, then sends.
- **`resendPendingEmailVerificationFor(userId, context)`** — end-to-end handler for `POST /account/email-change/resend`: no-ops (200, `resendAfter: 0`) when no change is pending; otherwise mails the *pending* address a fresh link and records `AUTH_EMAIL_CHANGE_RESENT`.
- **`pacedSend`** (internal) — shared pacing: cooldown → `mailRecipientRefusal` → the actual send callback.
- **`emailVerifyTokenTtlMs`** (internal) — reads `NODE_EMAIL_VERIFY_TTL_MS` from `accountConfig`; shared by both token kinds.

## Relationships
- **`../config`** (`accountConfig`) — reads the token-TTL setting at call time.
- **`../emails`** (`verifyRequestEmail`, `recipientLocale`, `greetableName`) — composes the verification mail body with the recipient's locale and name *before* the job is published.
- **`./mail`** (`sendAccountMail`) — enqueues the composed mail at high priority.
- **`./tokens`** (`issueToken`, `tokenSentAt`) — issues the token and reads its `sentAt` for cooldown calculations.
- **`./revocation`** (`revokeFor`) — imported for token revocation (used in the truncated lower portion).
- **`../token-types`** — the two (plus undo) token-type constants that parameterise every call.
- **`../cooldown`** (`cooldownRemaining`, `resendTooSoon`) — computes remaining wait and builds the "too soon" rejection response.
- **`../mail-budget`** (`mailRecipientRefusal`) — checks the per-recipient mailbox budget before sending.
- **`../audit`** (`accountAuditActions`) — provides the audit action enums recorded on successful sends.
- **`@infrastructure/observability/audit`** (`recordAudit`) — writes the audit event.
- **`../domain`** (`emailChangeNext`, `emailChangeStateOf`, `undoRestoresPreviousEmail`) — determines whether an email-change resend is valid from the state machine.
- **`./caller`** (`withOwnAccount`) — loads and guards the caller's own account document for the email-change resend path.
- **`@infrastructure/http/response`** (`generateSuccess`, `generateReject`) — shapes API responses for 200 / 404 / 409 / cooldown-reject outcomes.
- **`@infrastructure/i18n`** (`t`) — translates user-facing messages (already-verified, too-soon, not-found).

## Notes
- **Atomic replacement, not security.** Issuing a new token of the same kind revokes the previous one so the newest email is always the live link — a UX guarantee, not a security boundary (any spent token already proved the mailbox).
- **Cooldown is enforced here, not only in the route limiter.** `credentialLimiters` sets `skipSuccessfulRequests`, so a *successful* press would not spend rate-limit budget. Because each successful press publishes real mail, the cooldown lives in this service.
- **No enumeration blurring on the resend endpoints.** The caller is authenticated and acting on their own account, so an already-verified account gets an honest 409 rather than a soft 200.
- **Email-change resend mails only the *new* (pending) address.** The old address was notified once at request time; re-mailing it would read like a takeover alert.
- **Mail copy is fully resolved before enqueue.** The worker never needs a locale; `recipientLocale` picks the user's own language with `context.locale` as fallback.
- **File is truncated.** The lower portion (beyond `resendPendingEmailVerificationFor`) contains a "marks the account's address proven" mutation (sets `verifiedAt`, unpersisted) and the `completeEmailVerification` / `completeEmailChange` handlers that redeem the token, revoke related tokens, and persist the verification.
