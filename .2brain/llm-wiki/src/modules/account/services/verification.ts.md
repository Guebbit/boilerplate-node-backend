---
source: src/modules/account/services/verification.ts
sha256: 2c4b0fb28355d21b6aba783acd13f676eb551fe946c06427ab53bfe9be1a6a27
generated_at: 2026-11-14T18:54:51.537147+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/verification.ts

## Purpose

Unifies all email-verification mail-sending (signup confirm, explicit re-send, and email-change proof) behind a single token-issuing + mail-enqueueing mechanism so the two verification kinds cannot drift. Also owns the re-send pacing (cooldown + mail-budget) and the end-to-end HTTP handlers for `POST /account/email-verification/resend` and `POST /account/email-change/resend`.

## Key elements

- **`VERIFY_RESEND_SECONDS`** (60) — client-facing countdown before the Resend button re-enables; deliberately longer than the 2FA code window.
- **`VerifyLinkType`** — union of `EMAIL_VERIFY_TOKEN_TYPE` and `EMAIL_CHANGE_TOKEN_TYPE`; prevents a third type from being passed.
- **`VERIFICATION_TARGETS`** — maps each link type to its frontend route and the user field holding the target address (`email` vs `pendingEmail`).
- **`sendVerificationEmail(user, context, type?)`** — core primitive: issues/replaces the kind's live token, composes the i18n mail, enqueues via `sendAccountMail`. No-op if the target address is missing.
- **`requestEmailVerification(user, context)`** — wraps `sendVerificationEmail` and records the `AUTH_EMAIL_VERIFY_REQUESTED` audit action (only for the explicit user-initiated re-send, not signup/email-change side-effects).
- **`resendCooldownRemaining(user, type)`** — returns seconds left before a re-send is allowed, anchored on the live token's `sentAt`.
- **`pacedSend`** (internal) — sequential gate: cooldown → mail-budget → send. Returns a `ResponseReject` on any refusal.
- **`requestEmailVerificationFor(userId, context)`** — full handler for the signup/re-send endpoint: loads the user, rejects 404 / 409-already-verified, then runs `pacedSend`.
- **`resendPendingEmailVerificationFor(userId, context)`** — full handler for the email-change resend endpoint: no-op (200, `resendAfter: 0`) when no change is pending; otherwise `pacedSend` against `pendingEmail` with `EMAIL_CHANGE_TOKEN_TYPE`.
- **Mark-verified logic** (truncated in source) — sets `verifiedAt` on the document for the caller's `save`; called by `password-reset.ts` as `beforeSave` so verification lands in the same write as the new password.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/mail.ts` | `sendAccountMail` enqueues the composed mail for the worker. |
| `src/modules/account/emails.ts` | `verifyRequestEmail`, `recipientLocale`, `greetableName` build the mail body and pick the language. |
| `src/modules/account/cooldown.ts` | `cooldownRemaining` computes the wait; `resendTooSoon` builds the 429-style reject. |
| `src/modules/account/mail-budget.ts` | `mailRecipientRefusal` checks per-recipient budget before sending. |
| `src/modules/account/config.ts` | `accountConfig().NODE_EMAIL_VERIFY_TTL_MS` sets the shared token TTL. |
| `src/modules/account/audit.ts` | `accountAuditActions` supplies the action constants for audit records. |
| `src/infrastructure/observability/audit.ts` | `recordAudit` writes the audit entry. |
| `src/modules/account/domain/email-change.ts` | `emailChangeNext`, `emailChangeStateOf` determine whether a resend is valid for the current state. |
| `src/modules/account/services/caller.ts` | `withOwnAccount` loads the caller's own user document. |
| `src/infrastructure/http/response.ts` | `generateSuccess` / `generateReject` shape the HTTP payloads. |
| `src/infrastructure/i18n/index.ts` | `t()` resolves all user-facing strings. |
| `src/modules/account/services/email-change.ts` | Upstream caller that triggers the `EMAIL_CHANGE_TOKEN_TYPE` path after a `POST /account/email-change`. |

## Notes

- **Atomic replacement, not security.** Issuing a new token revokes the same kind's previous one so "the newest email is the one that works"; spending any of them proves the same mailbox regardless.
- **Cooldown is enforced here, not only in the route limiter.** `credentialLimiters` uses `skipSuccessfulRequests`, which would make a successful re-send cost zero rate-limit budget — unacceptable when each success publishes real mail.
- **Email-change resend targets only the new address.** The old address was informed once at request time; re-sending to it would look like a takeover alert.
- **Already-verified gets an honest 409**, not a silent 200, because the caller is authenticated and asking about their own account (no enumeration blur needed).
- **The TTL is shared across both token kinds** and is a deployment tuning knob (`NODE_EMAIL_VERIFY_TTL_MS`); the safe direction is shorter.
