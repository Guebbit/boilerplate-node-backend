---
source: src/modules/returns/controllers/post-return.ts
source_sha256: 7d9213f3ffb0e0208e28626a2e0383d489f25832bc5114847fdd0dc34a9bc797
context_sha256: 0ebd65bf820384ac24502a4f151162b9dee5738832d2dacebc4b0a2b5d447d3c
generated_at: 2026-11-22T07:22:33.361976+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/controllers/post-return.ts

## Purpose
Express controller for `POST /returns`. It opens a return, and it is also the EU withdrawal button, which is the same call with `reason: withdrawal`. A successful call always writes a return and answers `201` with a `Location` header. The return is open once the goods have shipped. It is closed at birth when a withdrawal reaches the order before dispatch and cancels it, or when a remainder cancellation is recorded.

## Key elements
- `postReturn(request, response)`: the exported handler.
  1. Validates `request.body` against `CreateReturnBody` using `parseBody`. If validation fails it returns early, because `parseBody` has already written the response.
  2. Converts the optional ISO-string `requestedAt` to a `Date`. The key is left out of the body when it is undefined.
  3. Reads `request.authContext`, which is non-null-asserted because the `isAuth` middleware guarantees it.
  4. Calls `returnService.createReturn(body, authContext, callerContextOf(request))`.
  5. If `refused(response, result)` is true, it stops there.
  6. Otherwise it calls `returnService.withActions(result.data, authContext)` and sends `createdResponse<Return>` with `Location: /returns/{id}`.
  7. Any rejected promise goes to `catchAs(response, 'postReturn')`.

## Relationships
- `src/infrastructure/http/controller.ts` supplies `parseBody`, `refused` and `catchAs`, which handle validation, service refusals and error mapping.
- `src/infrastructure/http/request.ts` supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` supplies `createdResponse`, which sends the 201 and the `Location` header.
- `src/modules/returns/services/index.ts` exports `returnService`, which provides `createReturn` and `withActions`.
- `src/types/index.ts` provides the `Return` type used for the response.
- `src/modules/returns/routes.ts` is the neighbor that wires this handler to the `POST /returns` route.

## Notes
- The handler is not `async`. It returns the promise chain, or `undefined` when body validation fails.
- The controller holds no business logic. Whether the return is open or closed at creation is decided in the service.
- `withActions` is applied to the result before it is returned, so the response carries the actions available to the caller.
- The request schema `CreateReturnBody` is imported from `@api/schemas.zod`.
