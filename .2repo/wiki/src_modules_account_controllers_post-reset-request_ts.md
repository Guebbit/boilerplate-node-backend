# src/modules/account/controllers/post-reset-request.ts

## Purpose

Handler for `POST /account/reset-request`. Accepts an email address, delegates token minting and mail publication to the account service, and returns a single indistinguishable 200 response regardless of whether the account exists — the explicit anti-enumeration design of this endpoint.

## Key elements

- **`postResetRequest(request, response)`** — The sole export. Validates the body shape, invokes `accountService.requestPasswordReset`, increments a Prometheus counter, emits an unconditional audit event, and replies with a fixed i18n success message.

## Relationships

- **`@infrastructure/http/controller`** — `parseBody` performs Zod shape validation and short-circuits with a 422 on failure.
- **`@infrastructure/http/request`** — `callerContextOf` extracts the authenticated/anonymous caller context (IP, user-agent, etc.) for audit and service use.
- **`@infrastructure/http/response`** — `successResponse` builds the uniform 200 envelope.
- **`@infrastructure/i18n`** — `t('account.reset.email-sent')` localizes the single user-visible string.
- **`@infrastructure/observability/audit`** — `buildAuditEvent` / `emitAuditEvent` record the request. Kept here (not in the service) so it fires even when no account is found.
- **`@modules/account/audit`** — `accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED` names the audit action.
- **`@modules/account/metrics`** — `authPasswordResetTotal` Prometheus counter, labeled `success` or `failure` based on the service's boolean return.
- **`@modules/account/services`** — `accountService.requestPasswordReset(email, context)` mints the reset token, publishes the mail job, and returns a `boolean`. The token value never enters this file.
- **`@modules/account/routes`** — Registers this handler on the `POST /account/reset-request` route.
- **`@types`** — `PasswordResetRequest` is the typed body shape expected on the Express request.

## Notes

- **Audit stays in the controller on purpose.** A service-level call would only execute after a successful account lookup, which would let an attacker distinguish "account exists" (audit emitted) from "does not exist" (no audit). Firing it here, unconditionally, preserves the invariant that the response is byte-identical for valid and invalid emails.
- **`.catch(() => false)`** swallows *all* service errors (DB down, mail provider timeout, etc.) so the client always sees 200. The `false` path is still recorded in the metric as `status: 'failure'`.
- **Actor is hardcoded `anonymous`** in the audit event — this is an unauthenticated endpoint; no user ID or role is available.
