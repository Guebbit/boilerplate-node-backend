---
source: src/infrastructure/surfaces/create-delete-controller.ts
sha256: e14aac786c683ac7386f504b967507521f261ea2b8dbd62c777ffb09f8b9d9a9
generated_at: 2026-10-14T08:18:32.643855+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-delete-controller.ts

## Purpose

Factory that builds the `DELETE /x` controller shared by every entity. Each module calls it once with a small spec (entity name, service call, i18n key) and gets back a fully wired Express handler that covers soft delete, hard delete, id extraction, `If-Match` preconditions, and uniform error handling—so module controllers stay one-liners.

## Key elements

- **`DeleteControllerSpec`** (interface) — the three per-entity differences: `entity` (lower-case singular, used to derive the operation name), `remove` (async service call receiving `id`, `hardDelete`, and the raw `Request` so the module can build its own `CallerContext`), and `notFoundKey` (i18n key for unknown/malformed ids).
- **`createDeleteController`** (exported const) — accepts a `DeleteControllerSpec`, returns a `namedHandler` whose function name is `delete<Entity>` (e.g. `deleteOrder`). Internally it:
  1. Extracts `id` via `requireId` (404 if from path, 422 naming `id` otherwise).
  2. Merges `hardDelete` across path/query/body with **OR semantics** (any `true` wins), then validates against `hardDeleteSchema`.
  3. Wraps the `remove(id, hardDelete, request)` call in `withIfMatch` for optimistic-concurrency fencing.
  4. Routes the result through `refused` → error envelope, or `successResponse` (200); unexpected throws are caught by `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — source of `namedHandler`, `operationName`, `refused`, `rejectValidation`, `catchAs`, and the `ServiceResult` type.
- **`src/infrastructure/http/ids.ts`** — provides `requireId` for multi-surface id extraction with per-surface error codes.
- **`src/infrastructure/http/preconditions.ts`** — provides `withIfMatch` to enforce the `If-Match` header before the delete executes.
- **`src/infrastructure/http/request.ts`** — provides `readInput` to merge `hardDelete` across path/query/body with `anyTrue` semantics.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 reply.
- **`src/infrastructure/http/schemas.ts`** — provides `hardDeleteSchema` (a boolean schema) for validation.
- **`src/modules/orders/controllers/delete-orders.ts`**, **`delete-products.ts`**, **`delete-users.ts`** — each calls `createDeleteController` with its own spec to produce the module's DELETE handler.

## Notes

- `hardDelete` is **OR'd** across transport surfaces rather than using the usual precedence rule: a `false` default from one surface never overrides a deliberate `true` from another. An undecodable value 422s.
- The handler's name is set via a computed property key (`operationName('delete', entity)`) specifically so stack traces and generated `docs/modules/` tables show `deleteOrder`, not a generic closure name.
- `remove` receives the raw Express `Request` (not a pre-built context) so each module's own wiring constructs `CallerContext` and the service records its audit row—consistent with `createUpdateController`'s `update` callback.
