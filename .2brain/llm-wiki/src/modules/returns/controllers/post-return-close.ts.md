---
source: src/modules/returns/controllers/post-return-close.ts
source_sha256: 610c08b7f62d042460fa96733385f0bfd21fa291567d9afdff319362cc26299c
context_sha256: 5dcbe4541d7b3acaa2d758291febd1cb624d914dbcc944fb39ba6d54d79f7785
generated_at: 2026-11-22T07:21:52.977352+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/controllers/post-return-close.ts

## Purpose
Express controller for `POST /returns/:id/close`, used when staff manually finish a received return. On success it responds 200 with the updated return (now `closed`), including its available actions for the caller.

## Key elements
- `postReturnClose(request, response)` — the only export. Flow:
  1. `requireId` validates the `:id` param, using the `returns.not-found` message key if it is missing or invalid. The handler returns early if no id is produced.
  2. `parseBody(CloseReturnBody, request.body ?? {}, response)` validates the body against the `CloseReturnBody` schema from `@api/schemas.zod`. The body is optional, so an absent body is treated as `{}`. The handler returns early if parsing fails.
  3. Reads `request.authContext!` (non-null assertion; the comment says the `isAuth` middleware guarantees it).
  4. Calls `returnService.closeReturnByHand(id, body.note, callerContextOf(request))`.
  5. If `refused(response, result)` reports a refusal, the handler returns. Otherwise it sends `successResponse<Return>` with `returnService.withActions(result.data, authContext)` and status 200.
  6. Rejected promises go to `catchAs(response, 'postReturnClose')`.

## Relationships
- `src/infrastructure/http/controller.ts` — supplies `catchAs`, `parseBody` and `refused`, which handle error mapping, body validation and refused service results.
- `src/infrastructure/http/ids.ts` — supplies `requireId` for path-id validation.
- `src/infrastructure/http/request.ts` — supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` — supplies `successResponse` for the 200 payload.
- `src/modules/returns/services/index.ts` — supplies `returnService`, which provides `closeReturnByHand` (the business logic) and `withActions` (decorates the result for the caller).
- `src/types/index.ts` — supplies the `Return` type used as the response payload type.
- `src/modules/returns/routes.ts` — the routes file; the handler is presumably mounted there for the path above, though the file content does not show this.

## Notes
- The handler contains no business logic. It only validates input, delegates to the service and shapes the response.
- It relies on an upstream auth middleware having set `request.authContext`. Without it, the non-null assertion would hide the missing value.
