---
source: src/modules/account/controllers/post-password-check.ts
source_sha256: 36e28a3e612a6872df31c843885228138ffc99f7b64b35d595bd239794adb0b9
context_sha256: 23efa7adf4421c8f74f980d9c38cb51e110484d75e6240291dabe884a31b5518
generated_at: 2026-11-22T03:26:26.271436+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-password-check.ts

## Purpose
Express controller for `POST /account/password/check`. It reports whether a candidate password appears in known breaches. The endpoint is advisory only and unauthenticated, because signup needs it before an account exists. It never blocks anything. The four password-SET paths remain the real gate and re-check server-side regardless of this endpoint's answer.

## Key elements
- `postPasswordCheck(request, response)`: the exported handler.
  - Validates the body against `CheckPasswordBreachedBody` (from `@api/schemas.zod`) using `parseBody`. If validation fails it returns early, since `parseBody` handles the response.
  - Calls `checkPasswordBreach(parsed.password)`.
  - Sends the result with `successResponse<PasswordCheck>`.
  - Routes any rejection through `catchAs(response, 'postPasswordCheck')`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody` (body validation) and `catchAs` (error handling, tagged with the handler name).
- `src/infrastructure/http/response.ts`: provides `successResponse`, which formats the success reply.
- `src/infrastructure/security/breached-passwords/index.ts`: provides `checkPasswordBreach`, which does the actual breach lookup.
- `src/types/index.ts`: provides the `PasswordCheck` type, used as the response payload type.
- `src/modules/account/routes.ts`: wires this handler to the `POST /account/password/check` route.

## Notes
- The result of `checkPasswordBreach` is passed straight to the response with no transformation in this file.
- The handler returns a promise on the success path and `undefined` on a validation failure.
