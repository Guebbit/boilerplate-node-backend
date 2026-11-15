---
source: src/modules/account/services/email-change.ts
sha256: 838e5f22072d9905a48273219ca81069601f5e859baad338aa8806c8bae4000d
generated_at: 2026-11-14T18:43:05.816428+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/email-change.ts

## Purpose

Service layer for the `POST /account/email-change` and `DELETE /account/email-change` endpoints. Handles requesting a new email address (parking it as `pendingEmail` without touching the proven `email` field), the full guard chain (collision checks, cooldown, mailbox budget), sending the two outbound mails (undo notice to the old address, verification link to the new one), and explicitly cancelling a pending change while revoking its token.

## Key elements

- **`requestEmailChange(userId, requestedEmail, context)`** — Exported handler for `POST`. Runs the guard chain (already-current → already-pending → taken-by-another → cooldown → mailbox budget → save) and, on success, sends both mails. Returns `ResponseSuccess<UserDocument>` or `ResponseReject`.
- **`cancelPendingEmailChange(userId, context)`** — Exported handler for `DELETE`. Cancels `pendingEmail` (no-op if none), revokes the live `email-change` token if a change was actually pending, and records an audit event.
- **`saveRequestedEmail`** *(private)* — The post-guard pipeline: cooldown check via `resendCooldownRemaining`, `mailRecipientRefusal` budget check, `setPendingEmail` write, then mail dispatch.
- **`sendEmailChangeMail`** *(private)* — Issues the undo token, sends the notice email to the old address, then delegates to `sendVerificationEmail` for the new address. Awaited (not fire-and-forget) so the token exists before the HTTP response returns.
- **`notifyEmailChangeRequested`** *(private)* — Wraps `sendEmailChangeMail` and records the `AUTH_EMAIL_CHANGE_REQUESTED` audit event after the mails are sent.
- **`revokeCanceledChange`** *(private)* — Removes `EMAIL_CHANGE_TOKEN_TYPE` tokens and records `AUTH_EMAIL_CHANGE_CANCELED`; skips both if no change was pending.
- **`alreadyHeld`** *(private)* — Shorthand 409 `ResponseReject` builder with a code + i18n key.

## Relationships

- **`src/modules/account/domain/email-change.ts`** — Provides the state-machine events (`emailChangeStateOf`, `emailChangeNext`) used to decide whether a cancel was meaningful.
- **`src/modules/account/domain/index.ts`** — Barrel re-export of the domain functions above.
- **`src/modules/account/emails.ts`** — Supplies `emailChangeNoticeEmail`, `greetableName`, `recipientLocale` for composing the old-address notice mail.
- **`src/modules/account/mail-budget.ts`** — `mailRecipientRefusal` gates the request before any write or mail is spent.
- **`src/modules/account/cooldown.ts`** — `resendTooSoon` shapes the 429 response when the per-minute pacing window has not elapsed.
- **`src/modules/account/audit.ts`** — `accountAuditActions` enum values for the two audit events (`REQUESTED`, `CANCELED`).
- **`src/modules/account/services/caller.ts`** — `withOwnAccount` wraps the request path so only the caller's own document is loaded.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every return value.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` converts unexpected DB errors into a standard 500 envelope.
- **`src/infrastructure/i18n/index.ts`** — `t()` resolves user-facing error and mail strings per caller locale.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` persists the two audit events.
- **`src/infrastructure/persistence/normalize-email.ts`** — `normalizeEmail` ensures case/whitespace-safe comparisons in the guard chain.
- **`src/modules/account/services/index.ts`** — Re-exports the two public handlers for barrel consumption.

## Notes

- **Guard order matters and is intentional.** The cooldown check (429) runs *before* the mailbox budget check so a paced request spends nothing. The budget check runs *before* the `setPendingEmail` write so a refused request leaves `pendingEmail` untouched.
- **The two mails are awaited sequentially, not fired in parallel.** The undo token is issued first; the verification mail (and its own token) follows. Responding before either completes would race the token with the client's next action.
- **`cancelPendingEmailChange` is a safe no-op.** Clients may call `DELETE` without first reading `GET /account`; the handler checks `hadPending` via the domain state machine and only revokes/audits when a change was actually live.
- **Only `pendingEmail` is loaded on the cancel path** (`findByIdWithPendingEmail`) — the full user document is not needed to decide whether a cancel applies.
- **The "taken by another account" check is request-time only.** The swap-time half (unique indexes on `users_email` and `users_pending_email`) is enforced by the database at confirm time, up to 24 h later.
