---
source: src/modules/account/controllers/post-pending-email-resend.ts
sha256: b7b4cba13b03482dc2f1d60252bbe0b21f47a7c0d1d64c0dd5703fc8e06d3560
generated_at: 2026-10-29T02:31:33.202311+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-pending-email-resend.ts

## Purpose

Thin HTTP adapter for `POST /account/email-change/resend`. It extracts the authenticated caller's ID and delegates to `accountService.resendPendingEmailVerificationFor`, then maps the result (or rejection) onto the Express response. The controller itself contains no business logic.

## Key elements

- **`postPendingEmailResend`** (exported) – Express controller handler. Reads `request.authContext.id`, calls the service with that ID plus caller context, then either short-circuits via `refused` or sends a `successResponse` with `result.data` and `result.status`. Errors are funnelled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – provides the `refused` guard (detects a "refused" result shape and ends the response) and `catchAs` (serialises a thrown/rejected error into a response).
- **`src/infrastructure/http/request.ts`** – provides `callerContextOf`, which extracts IP/UA metadata from the incoming request for audit or rate-limiting purposes.
- **`src/infrastructure/http/response.ts`** – provides `successResponse`, the standard 2xx envelope writer.
- **`src/modules/account/services/index.ts`** – source of `accountService`, the domain service whose `resendPendingEmailVerificationFor` method performs the actual resend.
- **`src/modules/account/routes.ts`** – registers this controller on the `POST /account/email-change/resend` route (upstream of the `isAuth` middleware that populates `request.authContext`).

## Notes

- `request.authContext!` is non-null-asserted; the `isAuth` middleware is expected to run before this handler. There is no runtime guard for a missing auth context.
- A caller with **no pending email change** is *not* an error path: the service returns `resendAfter: 0` through the normal success branch, so the client simply sees no countdown.
- The JSDoc notes the behaviour mirrors `POST /account/email-verification/resend`; the two endpoints share the same "resend + seconds-to-wait" response shape but target different pending actions (verification vs. change).
