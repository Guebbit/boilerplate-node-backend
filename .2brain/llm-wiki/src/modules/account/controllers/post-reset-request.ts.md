---
source: src/modules/account/controllers/post-reset-request.ts
source_sha256: 3d506ca09dbe653e0593bbe36effbd2ae579287199a0129094b4e94ae54b4aa6
context_sha256: 47a64b4a4a9f75a4b86488cef2ed60755b2170206a6d0efc5ac0601e0a8ec293
generated_at: 2026-11-22T03:27:05.530185+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-reset-request.ts

## Purpose
Express controller for `POST /account/password/reset`. It is a thin HTTP adapter over `accountService.requestPasswordReset`. It validates the body shape and then answers with the same empty response at once, whether or not the email belongs to an account. This prevents user enumeration through response content or response time.

## Key elements
- `postResetRequest(request, response)`: the only export. It handles a `Request<unknown, unknown, PasswordResetRequest>`.
  - It validates `request.body` against the `RequestPasswordResetBody` schema (from `@api/schemas.zod`) using `parseBody`. If validation fails, it returns early, because `parseBody` has already been given `response`.
  - It calls `accountService.requestPasswordReset(body.email, callerContextOf(request))` without awaiting it (`void`).
  - It then sends `noContentResponse(response)`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody`, which validates the body against a Zod schema and writes the error response itself.
- `src/infrastructure/http/request.ts`: provides `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: provides `noContentResponse`, which sends the uniform reply.
- `src/modules/account/services/index.ts`: exports `accountService`. Its `requestPasswordReset` does the real work.
- `src/types/index.ts`: supplies the `PasswordResetRequest` type for the request body.
- `src/modules/account/routes.ts`: the route table that wires this handler to the endpoint.

## Notes
- The service call is deliberately detached. Waiting on the lookup, token write and mail enqueue, which only happen for registered addresses, would make response time reveal which emails exist (OWASP "consistent response time").
- Per the source comments, the service owns the following. None of it is visible from this file.
  - the unconditional `AUTH_PASSWORD_RESET_REQUESTED` emit
  - the metric
  - fail-closed handling
  - failure logging
  - the mail send
- The token value therefore never reaches this controller.
- The `no-floating-promises` ESLint rule is disabled on that line, with a justification: `requestPasswordReset` is documented never to reject, since a failed lookup is logged and answers `false`.
- Validation checks shape only. Account existence is never revealed.
