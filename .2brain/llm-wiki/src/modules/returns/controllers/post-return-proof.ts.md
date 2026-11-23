---
source: src/modules/returns/controllers/post-return-proof.ts
source_sha256: 021b297f7af3cffb99d4bf6d36323ac984b6f939047506efa41562e5d91d1f17
context_sha256: 5dcbe4541d7b3acaa2d758291febd1cb624d914dbcc944fb39ba6d54d79f7785
generated_at: 2026-11-22T07:22:11.270210+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/controllers/post-return-proof.ts

## Purpose
Express controller for `POST /returns/:id/proof-of-sending`. Staff use it to record the carrier's proof of sending for an approved return. On success it responds 200 with the return as it now stands, still in the `approved` state.

## Key elements
- `postReturnProof(request, response)`: the only export. It runs these steps:
  1. Validates the `:id` param with `requireId`, using the `returns.not-found` error key. It returns early if the id is invalid.
  2. Validates the body against the `RecordProofOfSendingBody` zod schema with `parseBody`. It returns early on failure.
  3. Reads `request.authContext`.
  4. Calls `returnService.recordProofOfSending(id, { ...body, sentAt: new Date(body.sentAt) }, callerContextOf(request))`.
  5. If `refused(response, result)` is true, it returns without sending a success response. Otherwise it sends `successResponse<Return>` with status 200. The payload is `returnService.withActions(result.data, authContext)`.
  6. Any thrown error is handled by `.catch(catchAs(response, 'postReturnProof'))`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody`, `refused` and `catchAs`, which handle body validation, service refusals and error reporting.
- `src/infrastructure/http/ids.ts`: supplies `requireId`, which validates the route id.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which formats the 200 reply.
- `src/modules/returns/services/index.ts`: supplies `returnService`. This controller calls its `recordProofOfSending` and `withActions` methods.
- `src/types/index.ts`: supplies the `Return` type used for the response payload.
- `src/modules/returns/routes.ts`: the route table that wires `POST /returns/:id/proof-of-sending` to this handler. That wiring is not visible in this file.

## Notes
- The body's `sentAt` arrives as a value passed to `new Date(...)`, and the service receives a `Date`.
- The non-null assertion on `request.authContext!` relies on the `isAuth` middleware having run earlier in the chain. The file's own comment says so.
- The handler returns `undefined` when validation or a refusal ends the request. The response has already been sent by the helper in those cases.
