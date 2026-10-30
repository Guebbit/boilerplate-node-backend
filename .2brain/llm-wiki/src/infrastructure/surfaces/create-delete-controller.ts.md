---
source: src/infrastructure/surfaces/create-delete-controller.ts
sha256: d348ffe902738930f0d770f7c59483ff405afff5f20a13fdcd9338dc811119f4
generated_at: 2026-10-29T02:16:58.245112+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-delete-controller.ts

## Purpose

Factory that produces a module's delete controller from a small per-entity spec. It wires the full `DELETE /x`, `DELETE /x/:id`, and `DELETE /x/:id/hard` handler — id extraction, `hardDelete` flag merging, `If-Match` preconditions, service dispatch, and response/error envelope — so each module's `delete-<entity>.ts` is reduced to a three-field call.

## Key elements

- **`DeleteControllerSpec`** (interface) — the three per-entity differences: `entity` (lowercase singular name, e.g. `'order'`), `remove` (the service callback taking `id`, `hardDelete`, and raw `request`), and `notFoundKey` (i18n key for the 404 envelope).
- **`createDeleteController(spec)`** (function, default export shape) — returns a `namedHandler` whose display name is `delete<Entity>` (e.g. `deleteOrder`). Internally: extracts id via `requireId`, merges the `hardDelete` boolean via `readInput` + `parseBody(hardDeleteSchema)`, fences with `withIfMatch`, calls `remove`, then replies `204` or an error envelope via `refused`/`catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — supplies `namedHandler`, `operationName`, `parseBody`, `refused`, `catchAs`, and the `ServiceResult` type that `remove` must return.
- **`@infrastructure/http/ids`** — `requireId` pulls the id from path or body and 404/422s on failure.
- **`@infrastructure/http/preconditions`** — `withIfMatch` wraps the service call in an optimistic-concurrency fence.
- **`@infrastructure/http/request`** — `readInput` collects `hardDelete` from path segment, query, or body and ORs the booleans.
- **`@infrastructure/http/response`** — `noContentResponse` sends the `204` on success.
- **`@infrastructure/http/schemas`** — `hardDeleteSchema` validates the merged boolean; invalid values 422.
- **`src/modules/orders/controllers/delete-orders.ts`**, **`src/modules/products/controllers/delete-products.ts`**, **`src/modules/users/controllers/delete-users.ts`** — each imports `createDeleteController` and passes its own `DeleteControllerSpec`, yielding the `deleteOrder` / `deleteProduct` / `deleteUser` handlers.

## Notes

- `hardDelete` is **OR'd** across all sources (path flag, query, body) rather than following surface precedence: any explicit `true` wins over the `false` default on another transport. This is deliberate, documented inline.
- A malformed id in the **path** yields a 404 (same as unknown id); a malformed id in the **body** yields a 422 naming `id`. The `surface` argument to `requireId` (`'path'` vs `'create'`) drives this distinction.
- The `remove` callback receives the raw Express `Request` so the module's wiring can construct its own `CallerContext` and the service can write its audit row — the factory does not read any module-specific fields from the request.
- `parseBody(hardDeleteSchema, …)` returns `undefined` only on validation failure; a valid `false` passes through, so the handler must check `=== undefined` (not falsiness) before proceeding.
