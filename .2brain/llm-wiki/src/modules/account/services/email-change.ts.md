---
source: src/modules/account/services/email-change.ts
sha256: ba0714b081ce21fe6e2552a6abd4339c11a2de156f4a382151d4cd2ce6239b8a
generated_at: 2026-10-14T08:47:16.718401+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/email-change.ts

## Purpose
Handles the request and cancellation phases of a two-step email change: applying a new address to `user.pendingEmail` (never directly to `user.email`), sending the notice + verification mails, and explicitly revoking a pending change. The state-machine rules for *when* each action applies live in `domain/email-change`; confirming and undoing live in `./verification`.

## Key elements
- **`EmailChangeOutcome`** — `{ conflict, requested }` result type. `requested: true` means *this call* set `pendingEmail`, which is the sole gate for sending the old-address notice and the new verification link.
- **`applyEmailChangeRequest(user, requestedEmail)`** — Core evaluator for `PUT/PATCH /account`'s `email` field. No-ops for absent, current, or already-pending addresses. For any other address, checks `emailOrPendingEmailTaken` (request-time collision) before writing `user.pendingEmail`. Mutates `user` in place; persistence is the caller's `save()`.
- **`cancelPendingEmailChange(userId, context)`** — `DELETE /account/pending-email` handler. Loads only `pendingEmail`, cancels, revokes the live change token, and audits. Idempotent: a no-op cancel neither revokes nor logs.
- **`revokeCancelledChange(hadPending, user, context)`** *(private)* — Conditionally removes the `EMAIL_CHANGE_TOKEN_TYPE` token and records `AUTH_EMAIL_CHANGE_CANCELLED`.
- **`sendEmailChangeMail(user, context)`** *(private)* — Issues the undo token, mails the old address a 7-day undo notice, then calls `sendVerificationEmail` for the new address. **Awaited** to avoid racing the token with subsequent client actions.
- **`notifyEmailChangeRequested(user, context)`** — Public wrapper: sends both mails, then records `AUTH_EMAIL_CHANGE_REQUESTED`. Audit follows delivery, not the field write.

## Relationships
- **`../domain` (`email-change.ts`)** — `emailChangeStateOf` / `emailChangeNext` drive the state-transition check inside `cancelPendingEmailChange` (determines whether a cancel is a no-op).
- **`../emails`** — Provides `emailChangeNoticeEmail`, `greetableName`, `recipientLocale` for composing the old-address notice.
- **`./mail`** — `sendAccountMail` is the transport for the notice email.
- **`./verification`** — `sendVerificationEmail` delivers the new-address link; `EMAIL_CHANGE_TOKEN_TYPE` is shared for token revocation on cancel.
- **`./tokens`** — `issueToken` (undo token, change token) and `removeTokens` (revoke on cancel).
- **`./profile`** — Upstream caller that invokes `applyEmailChangeRequest` and `notifyEmailChangeRequested` as part of the `PUT/PATCH /account` flow.
- **`./services/index.ts`** — Re-exports the public API of this file.
- **`@infrastructure/i18n`** — `t()` for the localized "cancelled" success message.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` for the HTTP envelope.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` for the error path in `cancelPendingEmailChange`.
- **`@infrastructure/observability/audit`** + **`../audit`** — `recordAudit` + `accountAuditActions` for the two audit events.
- **`@infrastructure/persistence/normalize-email`** — `normalizeEmail` for case/format-insensitive comparisons.

## Notes
- **Never touches `user.email` directly.** The proven address only changes via the confirm endpoint in `./verification`.
- **`requested` is the mail gate.** A plain profile save that omits or repeats the current address must not cancel a pending change or re-send mails; only a genuinely new address triggers `notifyEmailChangeRequested`.
- **Collision is checked twice.** Request-time (`emailOrPendingEmailTaken`) and swap-time (unique indexes `users_email` / `users_pending_email`), because the two steps can be up to 24 h apart.
- **Undo token is single-instance.** Issuing a new one silently replaces any older undo token, since the older one would restore an address the current change no longer leaves behind.
- **`sendEmailChangeMail` is intentionally awaited** (unlike most account mail) so the client does not race the freshly issued token with a follow-up request.
