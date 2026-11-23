---
source: src/infrastructure/surfaces/create-delete-controller.ts
source_sha256: 337df151bc9601434ebcce8cd4e0e6d71e9e8e471a87395f5dd92e1156df7890
context_sha256: 61b3b240c818f39a6cc51dfa081e4c11db7aa6550c317dc08ac4dd86ee747a3a
generated_at: 2026-11-22T03:10:15.372130+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/surfaces/create-delete-controller.ts

## Purpose
Provides `createDeleteController`, a factory for the soft/hard delete controller shared by every module that exposes a `DELETE /x/:id` and `DELETE /x/:id/hard` pair. Each module keeps its own `delete-<entity>.ts` file that is a single call to this factory, specifying only what differs per entity: name, service call, and not-found i18n key.

## Key elements
- **`DeleteControllerSpec`**: the per-entity spec.
  - `entity`: lower-case singular name (e.g. `'order'`). It is used to build the operation name (`deleteOrder`).
  - `remove(id, hardDelete, request)`: the service call. `hardDelete` true destroys the row; false stamps `deletedAt`. It receives the raw `request` so the module can build its `CallerContext`. The service records its own audit row.
  - `notFoundKey`: the i18n key returned when the id matches nothing or is not a valid id.
- **`createDeleteController(spec)`**: returns an Express handler wrapped by `namedHandler`, named for the entity (e.g. `deleteOrder`) so stack traces and the generated `docs/modules/` tables show it.

Handler flow:
1. `requireId` reads the id from the path only (`surface: 'path'`). A malformed id gets the same 404 as an unknown one.
2. `readInput` with `surface: 'delete'` and `anyTrue: ['hardDelete']` merges `hardDelete` from its sources.
3. `parseBody(hardDeleteSchema, ...)` validates the value. On failure it sends a 422 and the handler stops.
4. `withIfMatch(request, id, () => remove(...))` runs the delete, fenced by an `If-Match` header if the request has one.
5. `refused(response, result)` sends the error envelope if the service refused. Otherwise `noContentResponse` is sent.
6. `catchAs(response, operation)` handles thrown errors.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `namedHandler`, `operationName`, `parseBody`, `refused`, `catchAs` and the `ServiceResult` type.
- `src/infrastructure/http/ids.ts`: `requireId` extracts and validates the path id.
- `src/infrastructure/http/request.ts`: `readInput` merges the `hardDelete` flag.
- `src/infrastructure/http/schemas.ts`: `hardDeleteSchema` validates the flag.
- `src/infrastructure/http/preconditions.ts`: `withIfMatch` applies optional `If-Match` fencing.
- `src/infrastructure/http/response.ts`: `noContentResponse` sends the success reply.
- `src/modules/orders/controllers/delete-orders.ts`, `src/modules/products/controllers/delete-products.ts`, `src/modules/users/controllers/delete-users.ts`: consumers, each calling this factory with its own entity spec.
- `src/modules/users/tests/integration/erasure-held-jobs.test.ts`: a related integration test in the users module.

## Notes
- `hardDelete` can arrive as a path segment (via `routeFlag`) or as a query value. The sources are OR'd, not resolved by surface precedence. Any true wins, all false or absent gives false, and any undecodable value gives a 422. This stops a default `false` from overriding a deliberate `true` sent on another transport.
- A valid `false` is distinct from `undefined`: only `undefined` means validation failed.
- The id is never read from a body, following RFC 9110 §9.3.5.
- The same pattern is used by `createUpdateController`'s `update`: the service writes its own audit row, and the controller passes it the raw request.
