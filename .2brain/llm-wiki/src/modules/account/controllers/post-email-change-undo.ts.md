---
source: src/modules/account/controllers/post-email-change-undo.ts
sha256: 3501aace490b7de337e78a7e440ce73243e355aee5a0f0f8c7dc5f2e02c89c3a
generated_at: 2026-10-29T02:29:43.975311+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change-undo.ts

## Purpose

Controller for `POST /account/email-change/undo`. It validates a one-time undo token (delivered to the old address) and reverts the account's email change. The endpoint is public—no session auth; the token in the body is the sole credential.

## Key elements

- **`postEmailChangeUndo`** (exported) — Express handler. Parses the body, calls `accountService.undoEmailChangeByToken`, returns `204 No Content` on success, or an error on refusal/exception. Tracks success/failure via the `authEmailChangeUndoTotal` counter.

## Relationships

- **`@infrastructure/http/controller`** — provides `parseBody`, `refused`, and `catchAs` helpers used for validation, result-checking, and error serialization.
- **`@infrastructure/http/request`** — provides `callerContextOf`, extracted and passed into the service call.
- **`@infrastructure/http/response`** — provides `noContentResponse` for the 204 reply.
- **`src/modules/account/services/index.ts`** — `accountService.undoEmailChangeByToken(token, callerContext)` performs the actual revert.
- **`src/modules/account/metrics.ts`** — `authEmailChangeUndoTotal` Prometheus counter incremented on every outcome.
- **`src/types/index.ts`** — `VerifyEmailConfirmRequest` type (the shared `{ token }` body shape).
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/email-change/undo` route.

## Notes

- The body is validated against **`ConfirmEmailChangeBody`**, the same Zod schema used by the confirm endpoint—there is no separate "undo" schema because both carry an identical `{ token }` shape.
- The imported type `VerifyEmailConfirmRequest` is **not** verification-specific; orval derived the name from the shared OpenAPI schema. Don't be misled by the name.
- A **409 Conflict** is an expected, non-buggy response: the old address may have been re-registered in the interim.
- Token-type isolation is enforced at the service layer: a confirm or verify token will never satisfy an undo call, so the three link types cannot cross-act.
