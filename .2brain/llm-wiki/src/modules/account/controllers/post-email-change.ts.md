---
source: src/modules/account/controllers/post-email-change.ts
sha256: 9463496202de80d705380cfad9c7cb4ad4cfc0e6fc070cfafb30af12c5062c94
generated_at: 2026-11-14T18:32:41.760996+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-email-change.ts

## Purpose

Thin HTTP adapter that handles `POST /account/email-change`. It validates the request body, delegates to `accountService.requestEmailChange`, and maps the result onto an HTTP success or error response. All business logic (messaging, pending-state transitions) lives in the service; this file only translates between HTTP and the service contract.

## Key elements

- **`postEmailChange`** (exported) — The sole export. Signature `(request: Request, response: Response) => void | Promise<void>`. Steps:
  1. Reads `request.authContext` (set upstream by the auth middleware).
  2. Parses `request.body` against the Zod schema `RequestEmailChangeBody`; short-circuits with a 422 if invalid.
  3. Calls `accountService.requestEmailChange(accountId, newEmail, callerContext)`.
  4. On success, emits a `Location: /account` header (RFC 9110 §8.8.3 "answer-as-resource") and a 200 body shaped as `AccountView`.
  5. On rejection or thrown error, delegates to `refused` / `catchAs` for a uniform error envelope.

## Relationships

- **`src/modules/account/routes.ts`** — Registers this handler on the `/account/email-change` route; the step-up (re-auth) guard executes *before* this controller is invoked, so `authContext` is guaranteed present.
- **`src/modules/account/services/index.ts`** — This file imports `accountService` from this module and calls its `requestEmailChange` method as the domain operation (pending-state, email dispatch).
- **`src/modules/account/session/account-view.ts`** — `accountViewOf` projects the service's result into the public `AccountView` shape for the response body.
- **`src/infrastructure/http/controller.ts`** — Supplies the shared helpers `parseBody`, `refused`, and `catchAs` used for validation and error normalization.
- **`src/infrastructure/http/preconditions.ts`** — `answerAsResource` sets the `Location` header pointing back to `/account`.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts IP/UA metadata for audit or rate-limiting passed into the service call.
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the 200 payload.
- **`src/types/index.ts`** — Provides the `AccountView` type used to type the response body.

## Notes

- The controller does **no** authentication or step-up checking itself; it trusts `request.authContext` to be populated. If the guard in `routes.ts` is bypassed, the `!` non-null assertion will throw.
- The `Location: /account` header is intentional (RFC 9110 §8.8.3): it tells clients where the updated resource now lives after the email change is requested, without requiring a redirect.
- `RequestEmailChangeBody` is imported from an external `@api/schemas.zod` package, not from the local module — schema changes live in the shared API contract.
