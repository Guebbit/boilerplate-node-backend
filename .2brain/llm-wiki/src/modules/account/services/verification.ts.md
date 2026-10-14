---
source: src/modules/account/services/verification.ts
sha256: 456727e90301dea429284db6a51f6c7ee37baba1242e3e733153325246195628
generated_at: 2026-10-14T08:57:24.095592+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/verification.ts

## Purpose

Single implementation point for issuing email-verification tokens and enqueuing the mail that carries them. Unifies two flows — signup/re-send and `PUT /account` email-change — behind one `sendVerificationEmail` so the two cannot drift. Issuing a token atomically replaces the same-kind previous token, guaranteeing "the newest email is the one that works."

## Key elements

- **`sendVerificationEmail(user, context, type?)`** — Core: looks up the target address via `VERIFICATION_TARGETS`, issues a token (replacing the kind's prior one), builds the localized mail body, and enqueues via `sendAccountMail`. Returns once the job is queued.
- **`requestEmailVerification(user, context)`** — Wraps `sendVerificationEmail` and records the `AUTH_EMAIL_VERIFY_REQUESTED` audit action. Used only for the explicit user-initiated re-send, not for signup side-effects.
- **`requestEmailVerificationFor(userId, context)`** — End-to-end `POST /account/verify-request`: loads the user, rejects if already verified (409), enforces cooldown, checks mail-budget, then delegates to `requestEmailVerification`.
- **`resendPendingEmailVerificationFor(userId, context)`** — End-to-end `POST /account/pending-email/resend`: mails only the *new* (pending) address, no-ops with `resendAfter: 0` when no change is in flight, audits `AUTH_EMAIL_CHANGE_RESENT`.
- **`resendCooldownRemaining(user, type, now?)`** — Reads the live token's `sentAt` and returns seconds remaining before another send is allowed (or 0).
- **`VERIFY_RESEND_SECONDS`** — Exported constant (60 s) the client uses for its countdown UI.
- **`VerifyLinkType`** — Union of `EMAIL_VERIFY_TOKEN_TYPE | EMAIL_CHANGE_TOKEN_TYPE`; prevents a third kind from being passed.
- **`VERIFICATION_TARGETS`** — Record mapping each token kind to its frontend route (`'verify'` / `'email-change'`) and the user-field that holds the target address.
- **`emailVerifyTokenTtlMs()`** — Reads `NODE_EMAIL_VERIFY_TTL_MS` from `accountConfig()`.
- **Truncated tail** — A function (partially visible) that sets `verifiedAt` on the document and calls `promoteVerifiedCustomer` for the `unverified → customer` role promotion; the promotion is an async membership write, not a plain field set.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/emails.ts` | Provides `verifyRequestEmail`, `recipientLocale`, `greetableName` for building the mail body. |
| `src/modules/account/config.ts` | `accountConfig()` supplies the token-TTL env var. |
| `src/modules/account/cooldown.ts` | `cooldownRemaining` computes the wait; `resendTooSoon` builds the structured 429 response. |
| `src/modules/account/domain/index.ts` (→ `email-change.ts`) | `emailChangeNext`, `emailChangeStateOf`, `undoRestoresPreviousEmail` drive the pending-email state machine. |
| `src/modules/account/audit.ts` | `accountAuditActions` supplies the audit-action constants for `recordAudit`. |
| `src/infrastructure/observability/audit.ts` | `recordAudit` and `AuditAction` type for audit logging. |
| `src/infrastructure/http/response.ts` | `generateSuccess` / `generateReject` and their return types shape every response. |
| `src/infrastructure/i18n/index.ts` | `t()` for all user-facing strings. |
| `src/modules/access/index.ts` | `promoteVerifiedCustomer` performs the `unverified → customer` role write on successful verification. |
| `src/kernel/access/tenant.ts` | `DEPLOYMENT_TENANT_ID` (used in the truncated portion, likely for tenant-scoped access checks during promotion). |
| `src/modules/account/controllers/post-signup.ts` | **Caller/consumer**: triggers `sendVerificationEmail` as a signup side-effect (not an import from this file's side). |
| `src/infrastructure/runtime/database.ts` | Indirect: `userService.findByIdWithCredentials` (from `@modules/users`) reads the user document. |

## Notes

- **Cooldown is enforced in the service, not only by the route limiter.** `credentialLimiters` uses `skipSuccessfulRequests`, so a *successful* resend would not spend limiter budget — but each successful press publishes real mail, so the service checks `cooldownRemaining` independently.
- **No enumeration blurring on re-send.** The caller is authenticated and asking about their own account, so an already-verified user gets an honest `409`, not a soothing `200`.
- **`VERIFY_RESEND_TOO_SOON_CODE` is module-private** (like the 2FA equivalent). Clients identify the error by reading the code off the response body, not by importing the constant.
- **Role promotion is async and orthogonal to the document save.** `verifiedAt` is mutated on the (unpersisted) document for the caller's `save`; the `promoteVerifiedCustomer` call is a separate membership write with no document field to ride along on.
- **The resend endpoint mails only the pending (new) address.** The old address was already notified at change-request time; re-mailing it would read like a takeover alert.
- **File is truncated** in the source provided; the verification-completion function (mark verified + promote role) and any further exports below that point are not fully visible.
