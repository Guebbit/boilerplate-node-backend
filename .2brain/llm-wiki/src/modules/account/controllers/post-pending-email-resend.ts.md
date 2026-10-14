---
source: src/modules/account/controllers/post-pending-email-resend.ts
sha256: e55780cb6a8cb8673a494251e5ab73edacbb1976ed6e3d48d185735d1abaa702
generated_at: 2026-10-14T08:36:02.524923+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-pending-email-resend.ts

## Purpose

Thin HTTP adapter for `POST /account/pending-email/resend`. Extracts the authenticated user's ID and caller context, delegates to `accountService.resendPendingEmailVerificationFor`, and maps the service result onto an Express response. It exists to keep routing/transport concerns separate from the account service logic.

## Key elements

- **`postPendingEmailResend(request, response)`** — exported handler. Reads `request.authContext.id`, calls the service, then either rejects via `refused` or emits `successResponse` with `data`, `status`, and `message`. Errors are funneled through `catchAs(response, 'postPendingEmailResend')`.

## Relationships

- **`@infrastructure/http/controller`** (`catchAs`, `refused`) — provides the standard error-catch and refusal-detection helpers used by every controller in this codebase.
- **`@infrastructure/http/request`** (`callerContextOf`) — extracts the caller context (e.g. IP, user-agent) from the Express request to pass downstream.
- **`@infrastructure/http/response`** (`successResponse`) — formats the success JSON envelope.
- **`../services`** (`accountService`) — the business-logic layer; this controller is its sole HTTP entry point for the resend action.
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/pending-email/resend` route (protected by `isAuth`).

## Notes

- Authentication is **assumed** at this layer; `request.authContext` is non-null because `isAuth` middleware runs first. No null-check is performed here.
- "Nothing pending" is **not** an error — the service returns a `resendAfter: 0` payload, which flows through the normal `successResponse` path.
- Response shape intentionally mirrors `POST /account/verify-request` (seconds-countdown field) so front-end clients can share the same countdown logic.
