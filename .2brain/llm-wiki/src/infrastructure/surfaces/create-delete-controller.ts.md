---
source: src/infrastructure/surfaces/create-delete-controller.ts
sha256: c2938bdaa8467a3c23d97f8790b9219a0ef5ce0854e674a4b1298d07d008e3f0
generated_at: 2026-11-14T18:19:10.529273+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-delete-controller.ts

## Purpose

Factory that builds the shared Express handler for a module's `DELETE /x/:id` and `DELETE /x/:id/hard` endpoints. Each entity module calls this factory once with a small spec (entity name, service callback, not-found key) to produce its own named delete handler, eliminating duplication across modules while keeping per-entity naming and audit identity intact.

## Key elements

- **`DeleteControllerSpec`** (exported interface) — the three things that differ per entity:
  - `entity`: lower-case singular name (`'order'`); feeds into the operation name.
  - `remove(id, hardDelete, request)`: the module's service call. `hardDelete=true` destroys the row; `false` stamps `deletedAt`. Receives the raw `Request` so the module can build its `CallerContext` and the service can write its own audit row.
  - `notFoundKey`: i18n key for the 404 envelope when the id is missing or unknown.
- **`createDeleteController(spec)`** (exported function) — returns a `namedHandler` whose name is `delete<Entity>` (e.g. `deleteOrder`). The handler:
  1. Extracts the id from the path via `requireId` (404 on missing/malformed).
  2. Reads `hardDelete` from path segment or query, OR'd across sources (any `true` wins), then validates against `hardDeleteSchema` (422 on undecodable value).
  3. Wraps the `remove` call in `withIfMatch` (If-Match precondition fence).
  4. On refusal, sends the error envelope; otherwise responds **204 No Content**.
  5. Catches all errors into a standard envelope via `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides the handler primitives: `namedHandler`, `operationName`, `parseBody`, `refused`, `catchAs`, and the `ServiceResult` type.
- **`src/infrastructure/http/ids.ts`** — provides `requireId` for path-based id extraction with a module-specific 404 key.
- **`src/infrastructure/http/preconditions.ts`** — provides `withIfMatch` for ETag-based fencing of the delete.
- **`src/infrastructure/http/request.ts`** — provides `readInput` to merge `hardDelete` from multiple transport surfaces.
- **`src/infrastructure/http/response.ts`** — provides `noContentResponse` for the 204 success reply.
- **`src/infrastructure/http/schemas.ts`** — provides `hardDeleteSchema` used to validate the merged boolean.
- **`src/modules/orders/controllers/delete-orders.ts`**, **`src/modules/products/controllers/delete-products.ts`**, **`src/modules/users/controllers/delete-users.ts`** — concrete consumers; each calls `createDeleteController` with its own spec to produce the module's delete handler.

## Notes

- The handler name (`deleteOrder`, `deleteProduct`, …) is set via `operationName('delete', entity)` and appears in stack traces, audit logs, and the generated `docs/modules/` tables. The spec's `entity` field and the handler name cannot drift apart.
- `hardDelete` is OR'd across path and query sources deliberately: a `false` (the default nobody types) must never outvote a `true` someone deliberately sent on a different transport.
- The id is path-only by design (RFC 9110 §9.3.5: DELETE names its target in the URL). There is no body on a DELETE.
- The `remove` callback receives the raw Express `Request` so the module's wiring layer can construct `CallerContext`; the controller itself does not inspect or transform the request beyond the id and `hardDelete` flag.
