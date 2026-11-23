---
source: src/modules/example/controllers/delete-example.ts
source_sha256: de23e4ae74ca76f2dc26656f7bd2ccc22dc8d67fa829b23a635423fff32efbbe
context_sha256: 1c333e329067c3d6e0de4d6b46fe5311421f70ab4dce91656012bf4df80db681
generated_at: 2026-11-22T05:06:58.687725+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/controllers/delete-example.ts

## Purpose
Express controller for `DELETE /examples/:id`. It permanently removes an example the caller is allowed to delete. It is hand-written rather than built with the shared delete factory, because that factory serves the soft/hard delete triplet and this module has no soft-delete tier.

## Key elements
- `deleteExample(request, response)`: the exported request handler.
  - It validates the `:id` param with `requireId`, using the `example.not-found` code. If the id is invalid, `requireId` has already answered and the handler returns a resolved promise.
  - It calls `exampleService.removeById(id, callerContextOf(request))` inside `withIfMatch`, so an `If-Match` header can fence the delete.
  - If `refused(response, result)` handles the result, the handler stops. Otherwise it sends a no-content response via `noContentResponse`.
  - Any rejection goes to `catchAs(response, 'deleteExample')`.

## Relationships
- `@infrastructure/http/ids` (`requireId`): parses and validates the route id and answers not-found on failure.
- `@infrastructure/http/preconditions` (`withIfMatch`): applies the `If-Match` precondition around the delete.
- `@infrastructure/http/request` (`callerContextOf`): builds the caller context passed to the service.
- `@infrastructure/http/controller` (`refused`, `catchAs`): converts refused results and thrown errors into HTTP responses.
- `@infrastructure/http/response` (`noContentResponse`): sends the success response.
- `src/modules/example/services/index.ts` (`exampleService`): its `removeById` method is called to perform the delete.
- `src/modules/example/routes.ts`: the route table that wires this handler to `DELETE /examples/:id`. This is inferred from the module doc and the neighbor graph, not shown in this file.

## Notes
- Documented status mapping:
  - A malformed id, an unknown id, and an example the caller may not delete all answer 404.
  - A stale `If-Match` tag answers 412, because the resource is `x-versioned`.
  - A successful delete answers 204 with no body.
- The handler returns a promise in every path, so `Promise.resolve()` stands in for the early return.
