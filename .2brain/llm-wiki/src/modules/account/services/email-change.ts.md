---
source: src/modules/account/services/email-change.ts
sha256: 23d9c8900bca61b446b5299137c83158d2d30684c36e89330918e65fefb373a7
generated_at: 2026-10-15T09:59:34.273592+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/email-change.ts

## Purpose

Handles the **request** and **cancellation** sides of an email-change flow: evaluating a `PUT/PATCH /account` `email` field against pending-change rules, persisting it to `pendingEmail`, sending the two outgoing mails (old-address undo notice + new-address verification link), and revoking the live token on explicit cancel. Confirming and undoing live in `./verification`.

## Key elements

- **`EmailChangeOutcome`** – `{ conflict, requested }` discriminant returned by `applyEmailChangeRequest`. `requested: true` means *this* call set `pendingEmail`, which gates the downstream mail-sending.
- **`applyEmailChangeRequest(user, requestedEmail)`** – Core state-transition guard. Returns a no-op outcome when the field is absent, equals the current email, or equals the already-pending email. Otherwise checks `emailOrPendingEmailTaken` for cross-account collision, then mutates `user.pendingEmail` in place (caller's `save()` persists).
- **`cancelPendingEmailChange(userId, context)`** – `DELETE /account/pending-email` handler. Idempotent when nothing is pending; when something *was* pending, revokes the `EMAIL_CHANGE_TOKEN_TYPE` token and records an audit event before returning the saved document.
- **`notifyEmailChangeRequested(user, context)`** – Awaits the two outbound mails (undo notice to old address, verification link to new address), then fires the `AUTH_EMAIL_CHANGE_REQUESTED` audit.
- **`revokeCancelledChange`** *(private)* – Removes the change token and records `AUTH_EMAIL_CHANGE_CANCELLED`; skips both when nothing was pending.
- **`sendEmailChangeMail`** *(private)* – Issues the undo token (7-day TTL), sends the notice email via `sendAccountMail`, then delegates to `sendVerificationEmail` for the new-address link.

## Relationships

| Neighbor | Interaction |
|---|---|
| `domain/email-change.ts` (via `domain/index`) | `emailChangeStateOf` + `emailChangeNext` drive the state machine that decides whether a cancel is meaningful. |
| `emails.ts` | Provides `emailChangeNoticeEmail`, `greetableName`, `recipientLocale` for composing the old-address notice. |
| `services/mail.ts` | `sendAccountMail` is the transport for the notice email. |
| `services/verification.ts` | `sendVerificationEmail` delivers the new-address link (not in the neighbor list but imported directly). |
| `services/tokens.ts` | `issueToken` (undo + change tokens) and `removeTokens` (cancel revocation). |
| `infrastructure/persistence/normalize-email.ts` | `normalizeEmail` used for all address comparisons (case/trim). |
| `infrastructure/http/response.ts` | `generateSuccess` / `generateReject` shape the cancel endpoint's response. |
| `infrastructure/http/errors.ts` | `rejectDatabaseEnvelope` wraps DB errors on the cancel path. |
| `infrastructure/observability/audit.ts` | `recordAudit` logs request and cancel events. |
| `modules/account/audit.ts` | `accountAuditActions` supplies the typed action constants. |
| `infrastructure/i18n/index.ts` | `t()` localises the cancel success message. |

## Notes

- **In-place mutation:** `applyEmailChangeRequest` writes directly to `user.pendingEmail`; the caller (profile service) is responsible for persisting via its own `save()`. Don't call it in isolation expecting a DB write.
- **Awaited mail:** `sendEmailChangeMail` is deliberately awaited (unlike most account mail) because the verification half issues its token synchronously; responding before it finishes would race the token with the client's next action.
- **Collision split:** Request-time checks both `email` and `pendingEmail` columns across accounts; swap-time (confirm/undo) relies on the unique indexes `users_email` / `users_pending_email`, which remain valid for up to 24 h apart.
- **Audit-after-mail:** The `AUTH_EMAIL_CHANGE_REQUESTED` audit fires only *after* both mails are dispatched—the audited fact is "a confirmation is in someone's inbox," not "a field was set."
- **Cancel idempotency:** Calling cancel with nothing pending is a safe no-op (200, no token removal, no audit). This lets clients call it unconditionally after a profile save.
