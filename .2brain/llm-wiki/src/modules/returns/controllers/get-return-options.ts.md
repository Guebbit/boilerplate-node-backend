---
source: src/modules/returns/controllers/get-return-options.ts
source_sha256: cf453a9da806d0d93cbd1c05029bf06aa553781feb56112743e53c4cf1588d74
context_sha256: 3de0d157c81f54965aa7c7d81613e5b9eda9e63c5325ae8be2c238ebdabc135e
generated_at: 2026-11-22T07:21:14.470694+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/controllers/get-return-options.ts

## Purpose
Express controller for `GET /returns/options?orderId=`. It reports what an order can still send back and still cancel, along with the refund each cancel would owe. The server computes these values and the client only displays them.

## Key elements
- `getReturnOptions(request, response)`: the exported request handler.
  - Validates `request.query` against `GetReturnOptionsQueryParams` using `parseBody`. If validation fails it returns early.
  - Reads `request.authContext`, which the handler assumes the `isAuth` middleware has already set.
  - Calls `returnService.getReturnOptions(parsed.orderId, authContext)`.
  - If `refused(response, result)` is true, the handler stops. Otherwise it responds with `successResponse<ReturnOptions>(response, result.data)`.
  - Rejections are passed to `catchAs(response, 'getReturnOptions')`.

## Relationships
- `src/infrastructure/http/controller.ts` provides `parseBody`, `refused` and `catchAs`, which handle query validation, refused service results and error handling.
- `src/infrastructure/http/response.ts` provides `successResponse`, which builds the success reply.
- `src/modules/returns/services/index.ts` exports `returnService`, which holds the business logic called here.
- `src/types/index.ts` provides the `ReturnOptions` type used for the response payload.
- `src/modules/returns/routes.ts` is the neighbor that wires this handler to the route. This is inferred from the file's role, since the handler itself doesn't show it.

## Notes
- The handler uses a non-null assertion on `request.authContext!`. It is only safe if `isAuth` runs before it.
- The handler is not `async`. It returns early with `undefined` on validation failure, and otherwise returns the promise chain.
- `parseBody` is used on `request.query`, not on a body.
