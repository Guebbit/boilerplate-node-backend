---
source: src/modules/returns/controllers/post-return-receive.ts
source_sha256: 30e4d3c03975a72b14743900595f2bb39b7527da8c897222d2cedc9f08cdb4a7
context_sha256: 5dcbe4541d7b3acaa2d758291febd1cb624d914dbcc944fb39ba6d54d79f7785
generated_at: 2026-11-22T07:22:22.263944+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/controllers/post-return-receive.ts

## Purpose
Express controller for `POST /returns/:id/receive`, called when returned goods arrive. It delegates to the return service to restock the units and refund the customer, then responds 200 with the updated return. The return is `closed` if the refund went through, or `received` if the provider refused the refund and it is left for a later sweep.

## Key elements
- `postReturnReceive(request, response)`: the only export. It runs these steps in order:
  1. Validates the `:id` param with `requireId`, using the `returns.not-found` error key. If it fails, it returns early.
  2. Parses the body against the `ReceiveReturnBody` zod schema (from `@api/schemas.zod`). A missing body is treated as `{}`, because receiving with nothing to deduct is the common case.
  3. Reads `request.authContext!`, which the `isAuth` middleware guarantees.
  4. Calls `returnService.receiveReturn(id, body, callerContextOf(request))`.
  5. If `refused(response, result)` reports a refusal, it returns without a success response.
  6. Otherwise it sends `successResponse<Return>` with status 200. The payload is `returnService.withActions(result.data, authContext)`.
  7. Any rejection goes to `catchAs(response, 'postReturnReceive')`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody`, `refused` and `catchAs`, which handle validation errors, service refusals and exceptions.
- `src/infrastructure/http/ids.ts`: `requireId` validates the route id.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` writes the 200 response.
- `src/modules/returns/services/index.ts`: exports `returnService`. The controller uses its `receiveReturn` and `withActions` methods.
- `src/types/index.ts`: supplies the `Return` type.
- `src/modules/returns/routes.ts`: the router that mounts this handler.

## Notes
- The handler is not `async`. It returns the promise chain, or `undefined` on early validation exits.
- `withActions` is given the auth context, so the returned return is shaped for the caller's permissions.
- The handler does not decide between `closed` and `received`. That comes from the service result.
