---
source: src/modules/account/services/email-change.ts
sha256: 28672556525b2b083c38a205d687869c80be934b2c2632177df9065d7a72d6df
generated_at: 2026-11-08T04:16:56.427763+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/email-change.ts

## Purpose

Handles the *request* and *cancellation* phases of an email address change. It sets `user.pendingEmail` (never `user.email` directly), sends the two mails a genuine request owes (old-address undo notice + new-address verification link), and revokes the token when a change is explicitly cancelled. Confirmation and undo live in `./verification`; the state-machine logic lives in `../domain/email-change`.

## Key elements

- **`EmailChangeOutcome`** (interface) — `{ conflict, requested }`; `requested` is `true` only when this call is what set `pendingEmail`, gating the downstream mail and audit side-effects.
- **`applyEmailChangeRequest(user, requestedEmail)`** — Evaluates the `email` field from a `PUT/PATCH /account` body against the current and pending addresses. No-ops on absent / current / already-pending values; otherwise runs a cross-account collision check (`emailOrPendingEmailTaken`) before writing `user.pendingEmail` in place. Returns the outcome; does not persist or send mail.
- **`cancelPendingEmailChange(userId, context)`** — `DELETE /account/email-change` handler. Loads only `pendingEmail`, clears it, and (if a change *was* pending) revokes the live `EMAIL_CHANGE` token so the old link cannot still swap in the address. Returns 401 if the user is not found.
- **`revokeCanceledChange`** *(private)* — Conditional token removal + audit; skipped entirely on a no-op cancel.
- **`sendEmailChangeMail`** *(private)* — Awaits `issueToken` for the 7-day undo, mails the old address (`emailChangeNoticeEmail`), then delegates to `sendVerificationEmail` for the new-address link. Awaiting (vs. fire-and-forget) prevents a race with the client's next action.
- **`notifyEmailChangeRequested(user, context)`** — Public wrapper: sends both mails **then** records the `AUTH_EMAIL_CHANGE_REQUESTED` audit event. The audit trails the mail, not the field write.

## Relationships

- **`../domain/email-change` / `../domain/index`** — Provides `emailChangeStateOf` and `emailChangeNext`, the finite-state helpers that determine whether a cancel is meaningful.
- **`../token-types`** — Supplies `EMAIL_CHANGE_TOKEN_TYPE`, `EMAIL_CHANGE_UNDO_TOKEN_TYPE`, and `EMAIL_CHANGE_UNDO_TTL_MS` (7 days).
- **`./tokens`** — `issueToken` (undo token) and `removeTokens` (revoke on cancel).
- **`./verification`** — `sendVerificationEmail` delivers the new-address confirmation link and issues its own `EMAIL_CHANGE` token.
- **`./mail`** — `sendAccountMail` performs the actual SMTP delivery of the old-address notice.
- **`../emails`** — `emailChangeNoticeEmail`, `greetableName`, `recipientLocale` build the notice content and locale-aware greeting.
- **`../audit`** — `accountAuditActions` enum values for the two audit events.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit entries.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the HTTP envelope for `cancelPendingEmailChange`.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` maps unexpected DB errors to a consistent error response.
- **`@infrastructure/persistence/normalize-email`** — `normalizeEmail` ensures case/whitespace-insensitive comparison in all three no-op branches.
- **`./profile`** (caller) — Invokes `applyEmailChangeRequest` and `notifyEmailChangeRequested` as part of the `PUT/PATCH /account` handler; this module is re-exported through `./index`.

## Notes

- **Mutates in place.** `applyEmailChangeRequest` writes `user.pendingEmail` on the loaded document; persistence is the *caller's* `userService.update`. This file never calls `save()` itself.
- **Collision check is request-time only.** The DB unique indexes on `users_email` and `users_pending_email` are the swap-time guard (up to 24 h later). Both halves are required; neither alone is sufficient.
- **Mail is awaited, not fire-and-forget.** `sendEmailChangeMail` chains both sends before resolving, deliberately unlike most other account mail, to avoid a token-issuance race with the client's next request.
- **Audit timing.** The "requested" audit fires *after* both mails succeed; the "canceled" audit fires *after* token removal. A failed mail or DB error produces no audit event.
- **`requested` flag gates everything downstream.** A plain profile save that doesn't change the email, or a resend of the already-pending address, returns `{ conflict: false, requested: false }` and must not trigger mail or audit.
