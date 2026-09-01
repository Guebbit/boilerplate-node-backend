# src/modules/account/controllers/post-reset-request.ts

## Purpose

Thin HTTP adapter for `POST /account/reset-request`. It validates the request body, delegates to `accountService.requestPasswordReset`, and returns an identical success response regardless of whether the email corresponds to a real account — the core design goal is preventing user enumeration.

## Key elements

- **`postResetRequest`** (exported) — Express handler. Validates the body via `parseBody(RequestPasswordResetBody, …)`, extracts caller context, invokes `accountService.requestPasswordReset`, catches any rejection (defaults to `false`), records a metric, emits an unconditional audit event, and sends a 200 with the i18n string `account.reset.email-sent`.

## Relationships

- **`@infrastructure/http/controller`** — `parseBody` performs Zod schema validation and writes the 400 error; early-returns when validation fails.
- **`@infrastructure/http/request`** — `callerContextOf(request)` supplies the audit/metrics context (IP, user-agent, etc.).
- **`@infrastructure/http/response`** — `successResponse` builds the 200 JSON envelope.
- **`@infrastructure/i18n`** — `t('account.reset.email-sent')` resolves the client-facing message.
- **`@infrastructure/observability/audit`** — `buildAuditEvent` / `emitAuditEvent` record the action with `actor_user_id: 'anonymous'`.
- **`@modules/account/audit`** — `accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED` provides the canonical action string.
- **`@modules/account/metrics`** — `authPasswordResetTotal.inc({ status })` tracks success vs. failure.
- **`@modules/account/services`** — `accountService.requestPasswordReset(email, context)` does the actual token minting, job publishing, and boolean return.
- **`@types`** — `PasswordResetRequest` types the validated body.
- **`@modules/account/routes`** — registers this handler at the `POST /account/reset-request` path.

## Notes

- **Audit fires unconditionally.** The comment block makes this a deliberate design choice: the event is emitted in the controller (not the service) so it fires even when the email does not match any account, preserving the identical-response invariant.
- **Fail-closed on service errors.** `.catch(() => false)` swallows any rejection (e.g., mail-queue outage) so the client still receives 200 and the metric records a `failure`. No error detail leaks.
- **Token never touches this file.** `requestPasswordReset` mints the reset token and enqueues the mail job internally; only a boolean reaches the controller.
