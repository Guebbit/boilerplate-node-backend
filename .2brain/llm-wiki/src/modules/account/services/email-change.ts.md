---
source: src/modules/account/services/email-change.ts
sha256: 7d2a904f1a16f846a5dd94f9d54ea511916afa66114d3b06650389a42a705116
generated_at: 2026-10-29T02:40:21.036595+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/email-change.ts

## Purpose
Handles the **request** and **cancel** phases of an account email change. It writes to `user.pendingEmail` (never `user.email` directly), sends the two required emails (old-address notice with undo link, new-address verification link), and manages the associated tokens. The confirm and undo actions live in `./verification`.

## Key elements
- **`EmailChangeOutcome`** — interface with `conflict` (address already taken) and `requested` (this call set `pendingEmail`). The `requested` flag is what gates whether downstream code sends emails.
- **`applyEmailChangeRequest(user, requestedEmail)`** — Core mutation. No-op for absent / current / already-pending addresses. Otherwise checks `userService.emailOrPendingEmailTaken` (collision guard), sets `user.pendingEmail`, and returns the outcome. Mutates `user` in place; the caller's `save()` persists.
- **`cancelPendingEmailChange(userId, context)`** — `DELETE /account/email-change`. Loads only `pendingEmail`, cancels, and (if a change *was* pending) revokes the `EMAIL_CHANGE` token and records an audit event. Idempotent: a cancel with nothing pending is a clean no-op.
- **`notifyEmailChangeRequested(user, context)`** — Sends both emails (awaited) then records the `AUTH_EMAIL_CHANGE_REQUESTED` audit event. Exported so the profile-update caller can invoke it only when `requested` is true.
- **`revokeCancelledChange`** (private) — Removes the `EMAIL_CHANGE` token and logs the cancel audit; short-circuits when nothing was pending.
- **`sendEmailChangeMail`** (private) — Issues an `EMAIL_CHANGE_UNDO` token (7-day TTL), sends the old-address notice via `sendAccountMail`, then delegates to `sendVerificationEmail` for the new-address link.

## Relationships
- **`src/modules/account/emails.ts`** — Provides `emailChangeNoticeEmail`, `greetableName`, `recipientLocale` for composing the old-address notice.
- **`src/modules/account/services/mail.ts`** — `sendAccountMail` is the transport for the notice email.
- **`src/modules/account/services/verification.ts`** — `sendVerificationEmail` handles the new-address verification link and its own token issuance.
- **`src/modules/account/services/tokens.ts`** — `issueToken` (undo token) and `removeTokens` (revoke on cancel).
- **`src/modules/account/token-types.ts`** — `EMAIL_CHANGE_TOKEN_TYPE`, `EMAIL_CHANGE_UNDO_TOKEN_TYPE`, `EMAIL_CHANGE_UNDO_TTL_MS` constants.
- **`src/modules/account/domain/index.ts`** (→ `domain/email-change.ts`) — `emailChangeStateOf` and `emailChangeNext` used in `cancelPendingEmailChange` to detect whether a pending change existed.
- **`src/modules/account/audit.ts`** — `accountAuditActions` constants for the two audit events.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` for both the request and cancel audit events.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` and response types used by `cancelPendingEmailChange`.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` for the catch path in `cancelPendingEmailChange`.
- **`src/infrastructure/persistence/normalize-email.ts`** — `normalizeEmail` for all address comparisons (never raw string equality).
- **`src/modules/account/services/profile.ts`** — The caller that invokes `applyEmailChangeRequest` and conditionally `notifyEmailChangeRequested` during `PUT/PATCH /account`.

## Notes
- **Two-phase collision guard.** Request-time: `emailOrPendingEmailTaken` checks every account's `email` *and* `pendingEmail`. Swap-time (in verification): the `users_email` and `users_pending_email` unique indexes cover the up-to-24-hour window between request and confirm.
- **Awaited mail, not fire-and-forget.** `notifyEmailChangeRequested` awaits `sendEmailChangeMail` before resolving, because the verification half issues its token internally; responding early would race the token against the client's next action.
- **`requested` is the only gate for email.** A profile save that omits `email`, or re-submits the current / pending address, must not trigger the old-address notice or the verification link.
- **In-place mutation.** `applyEmailChangeRequest` sets `user.pendingEmail` on the passed document; it does not call `save()`. The caller (profile service) is responsible for persisting.
- **Cancel is idempotent.** Calling `DELETE /account/email-change` with nothing pending returns `200` without touching tokens or audit — safe for clients to call unconditionally.
