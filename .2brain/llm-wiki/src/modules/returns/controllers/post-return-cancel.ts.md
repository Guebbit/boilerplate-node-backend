---
source: src/modules/returns/controllers/post-return-cancel.ts
source_sha256: e0793962e78a5027d0aff188a729f1b6ddb3a2717ef5c225fe8d4fc015ea12ff
context_sha256: 5dcbe4541d7b3acaa2d758291febd1cb624d914dbcc944fb39ba6d54d79f7785
generated_at: 2026-11-22T07:21:46.310515+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/controllers/post-return-cancel.ts

## Purpose
Express controller for `POST /returns/:id/cancel`. It lets staff cancel an approved return whose goods never arrived. On success it responds 200 with the return in its new `canceled` state, including the actions available to the caller.

## Key elements
- `postReturnCancel(request, response)`: the exported handler, which does the following:
  1. Validates the `:id` param with `requireId`, using the `returns.not-found` error key. It returns early if the id is invalid.
  2. Parses the body with `parseBody(CancelReturnBody, request.body ?? {}, response)`. The body is optional, so an empty body is allowed (cancel with no note). It returns early if parsing fails.
  3. Reads `request.authContext` with a non-null assertion, relying on the `isAuth` middleware to have set it.
  4. Calls `returnService.cancelReturn(id, body.note, callerContextOf(request))`.
  5. If `refused(response, result)` is true, it returns without sending a success response. Otherwise it sends `successResponse<Return>` with status 200. The payload is `returnService.withActions(result.data, authContext)`.
  6. Rejections are handled by `catchAs(response, 'postReturnCancel')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `catchAs`, `parseBody` and `refused`, which handle errors, body validation and service refusals.
- `src/infrastructure/http/ids.ts`: supplies `requireId` for validating the route id.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which formats the 200 response.
- `src/modules/returns/services/index.ts`: supplies `returnService`, whose `cancelReturn` performs the cancellation and whose `withActions` decorates the result.
- `src/types/index.ts`: supplies the `Return` type used in `successResponse<Return>`.
- `src/modules/returns/routes.ts`: the route definitions that wire this handler to `POST /returns/:id/cancel`. This is inferred from the route documented in the file header.

## Notes
- The handler returns without sending anything itself when `requireId` or `parseBody` fails, or when `refused` reports a refusal. Those helpers are responsible for writing the error response.
- The handler assumes `isAuth` middleware runs earlier in the chain. Without it, `authContext!` would be undefined.
- The request body schema `CancelReturnBody` is imported from `@api/schemas.zod`.
