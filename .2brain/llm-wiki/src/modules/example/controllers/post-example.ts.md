---
source: src/modules/example/controllers/post-example.ts
source_sha256: 94e7249ea4d497b3803f0229c7ab60d6bfda69a2b997375644753c9527144286
context_sha256: ee564135ccf7a034be2810863a5ae0d06c3c8becd3234ca42d1d286b2637dc15
generated_at: 2026-11-22T05:07:48.589800+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/controllers/post-example.ts

## Purpose
Express controller for `POST /examples`. It validates the request body, creates a draft example owned by the caller through the service layer, and replies `201 Created` with a `Location` header. It serves as the module's template for a "create" controller.

## Key elements
- `createTrimmedBody` (module-private): `CreateExampleBody` (generated schema from `@api/schemas.zod`) extended so `title` and `body` pass through `trimmedInto` first. A whitespace-only value therefore fails with the same field-level 422 as an empty one.
- `postExample` (exported): handler wrapped in `namedHandler('postExample', ...)`. Flow:
  1. `parseBody(createTrimmedBody, readInput(request, { surface: 'create' }), response)`. If it returns `undefined`, the handler stops with `Promise.resolve()`.
  2. `exampleService.create(body, callerContextOf(request))`.
  3. `refused(response, result)` is checked, and the handler returns if it was refused.
  4. Otherwise it builds `location = /examples/${result.data.id}`, calls `answerAsResource(response, result.data, location)`, then `createdResponse(response, result.data, location)`.
  5. `.catch(catchAs(response, 'postExample'))` handles errors.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `namedHandler`, `parseBody`, `refused` and `catchAs`, which cover handler naming, body parsing, refused-result handling and error mapping.
- `src/infrastructure/http/request.ts`: `readInput` reads the request input for the `create` surface, and `callerContextOf` extracts the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `createdResponse` sends the 201 response with the `Location`.
- `src/infrastructure/http/preconditions.ts`: `answerAsResource` is called with the response, the created resource and its location, to set the new example's real tag and the resource it belongs to.
- `src/infrastructure/http/schemas.ts`: `trimmedInto` provides the trimming wrapper for the schema fields.
- `src/modules/example/services/index.ts`: exports `exampleService`, whose `create` method performs the creation.
- `src/modules/example/routes.ts`: the route layer that presumably mounts `postExample` at `POST /examples`. The mounting itself is not visible in this file.

## Notes
- Validation failures and service refusals are handled by helpers that write the response themselves. The handler only returns early and does not throw or respond in those branches.
- The handler always returns a Promise, including on the early-exit path.
