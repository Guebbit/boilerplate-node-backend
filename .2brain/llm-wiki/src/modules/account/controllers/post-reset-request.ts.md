---
source: src/modules/account/controllers/post-reset-request.ts
sha256: d472ee5593ab0f1c5df247461fec2620d8274880eb00720d9fd7c5c7a3fca9b3
generated_at: 2026-09-27T14:26:14.794613+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-request.ts

## Purpose

Thin HTTP adapter for `POST /account/reset-request`. It validates the request body, delegates to `accountService.requestPasswordReset`, and always returns the same `200` response regardless of whether the email belongs to a real account — the core mechanism for preventing user enumeration.

## Key elements

- **`postResetRequest(request, response)`** – Express handler (the sole export). Validates the body via `parseBody` + `RequestPasswordResetBody` (Zod), calls the service, records metrics and an audit event, and responds with a fixed i18n message (`t('account.reset.email-sent')`).
- **`.catch(() => false)`** – Swallows any service error so the public response is identical to a "not found" case; the metric is tagged `status: 'failure'`.
- **Audit block** – Calls `recordAudit` with `accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED`, actor fixed to `anonymous`, outcome always `'success'` (the *request* succeeded, not the reset).

## Relationships

- **`@infrastructure/http/controller`** → `parseBody` (body shape validation; short-circuits with an error response if invalid).
- **`@infrastructure/http/request`** → `callerContextOf` (extracts caller metadata for audit/metrics scoping).
- **`@infrastructure/http/response`** → `successResponse` (uniform 200 reply).
- **`@infrastructure/i18n`** → `t` (localises the response message).
- **`@infrastructure/observability/audit`** → `recordAudit` (persists the audit event).
- **`@/modules/account/audit`** → `accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED` (action enum key).
- **`@/modules/account/metrics`** → `authPasswordResetTotal` (Counter incremented with `status: success|failure`).
- **`@/modules/account/services`** → `accountService.requestPasswordReset` (performs token minting, job publishing; returns a boolean only — the token never reaches this file).
- **`@/types`** → `PasswordResetRequest` (typed body shape for the Express request generic).
- **`@/modules/account/routes`** → imports this controller to register the `POST /account/reset-request` route.

## Notes

- **Audit fires unconditionally.** The controller-level `recordAudit` runs after both success *and* failure paths. The inline comment explains this deliberately: a service-level audit would only fire when a user is found, leaking existence.
- **Actor is hardcoded `anonymous`.** No auth middleware guards this route; the audit schema still requires `actor_user_id`/`actor_role`.
- **Token is opaque here.** The service mints the reset token, enqueues the email job, and reports back only a `boolean`. This file never sees the token value.
- **Fail-closed on any service error.** `.catch(() => false)` means a transient DB or mail-queue failure produces the same "email sent" response, tagged `failure` in the metric. There is no retry or error propagation to the client.
