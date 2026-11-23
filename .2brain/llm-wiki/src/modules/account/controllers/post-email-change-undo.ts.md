---
source: src/modules/account/controllers/post-email-change-undo.ts
source_sha256: 3501aace490b7de337e78a7e440ce73243e355aee5a0f0f8c7dc5f2e02c89c3a
context_sha256: 6a6ec9eba1dcb3891a1fdd2f1dc44246f33d146f1473ec9beb148577ca450e09
generated_at: 2026-11-22T03:24:25.131836+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-email-change-undo.ts

## Purpose
Express controller for `POST /account/email-change/undo`. It spends the one-time undo link sent to the old email address and reverts the account to its previous state. The endpoint is public: the `token` in the request body is the credential.

## Key elements
- `postEmailChangeUndo(request, response)` — the only export.
  - Validates the body with `ConfirmEmailChangeBody`, reusing the confirm endpoint's schema because both bodies are `{ token }`.
  - Calls `accountService.undoEmailChangeByToken(token, callerContextOf(request))`.
  - On success, increments the metric with `status: 'success'` and sends a no-content response.
  - On a refused result, a validation failure, or a thrown error, increments the metric with `status: 'failure'`.

## Relationships
- `src/infrastructure/http/controller.ts` — supplies `parseBody` (body validation), `refused` (turns a refused service result into a response) and `catchAs` (maps thrown errors to responses, labelled `'postEmailChangeUndo'`).
- `src/infrastructure/http/request.ts` — `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` — `noContentResponse` sends the success reply.
- `src/modules/account/services/index.ts` — exports `accountService`, whose `undoEmailChangeByToken` method is called to do the revert.
- `src/modules/account/metrics.ts` — `authEmailChangeUndoTotal` counter, labelled by `status`.
- `src/types/index.ts` — the `VerifyEmailConfirmRequest` type for the request body.
- `src/modules/account/routes.ts` — presumably where this handler is mounted; this file does not show the wiring.
- `src/infrastructure/adapters/logger.ts` — not used directly in this file.

## Notes
- The body type is `VerifyEmailConfirmRequest` rather than an undo-specific name. Orval names the type after the shared `{ token }` schema used by both token endpoints.
- Tokens are type-scoped. The service only accepts an `email-change-undo` token, so confirmation and verify tokens cannot trigger an undo, and the reverse also holds.
- A 409 from the service is a real outcome. The previous address may have been claimed by someone else in the meantime. The error is handled through `catchAs`.
- The handler returns early (`undefined`) on validation failure and on a refused result, so not every path returns the promise.
