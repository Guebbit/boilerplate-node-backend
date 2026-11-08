---
source: src/infrastructure/surfaces/create-delete-controller.ts
sha256: b0c2681d5dabf45db3487bb2cac96498a8850811c7e00bdba52d47f7867e8f46
generated_at: 2026-11-08T03:50:31.867637+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-delete-controller.ts

## Purpose

Factory that builds the shared Express handler for the `DELETE /x/:id` and `DELETE /x/:id/hard` route triplet used by every module. Each module's `delete-<entity>.ts` file supplies a small spec (entity name, service call, i18n not-found key) and receives a fully wired, named handler back, eliminating per-entity duplication of the id-extraction, `hardDelete` parsing, `If-Match` fencing, and error-envelope logic.

## Key elements

- **`DeleteControllerSpec`** (interface) — the three per-entity inputs: `entity` (lower-case singular name, used to build the operation string), `remove(id, hardDelete, request)` (the service call that stamps `deletedAt` or destroys the row), `notFoundKey` (i18n key for 404).
- **`createDeleteController(spec)`** (exported factory) — returns a `namedHandler` that:
  1. Extracts the id from the **path only** via `requireId`; a malformed id is treated as a 404.
  2. Reads the `hardDelete` flag from path/query via `readInput` with `anyTrue` OR semantics, then validates it against `hardDeleteSchema`.
  3. Fences the call with `withIfMatch` (conditional `If-Match` precondition).
  4. Calls `remove()`, checks the result with `refused`, sends `204 No Content` on success, or delegates to `catchAs` on error.

## Relationships

- **`@infrastructure/http/controller`** — source of `namedHandler`, `operationName`, `parseBody`, `refused`, `catchAs`, and the `ServiceResult` type.
- **`@infrastructure/http/ids`** — `requireId` performs path-based id extraction and the 404 short-circuit.
- **`@infrastructure/http/preconditions`** — `withIfMatch` wraps the `remove` call in an `If-Match` precondition check.
- **`@infrastructure/http/request`** — `readInput` reads the `hardDelete` flag across transport surfaces with OR semantics.
- **`@infrastructure/http/response`** — `noContentResponse` sends the `204` on success.
- **`@infrastructure/http/schemas`** — `hardDeleteSchema` validates the merged boolean value.
- **`src/modules/orders/controllers/delete-orders.ts`**, **`…/delete-products.ts`**, **`…/delete-users.ts`** — module-level controllers that each make a single call to `createDeleteController` with their entity-specific spec.

## Notes

- `hardDelete` uses **OR across surfaces** (path segment *or* query param), not surface-precedence. Any `true` wins; the default is `false`. An undecodable value yields a `422`.
- The `parseBody` result is checked with `=== undefined` (not a truthy check) because `false` is a valid, meaningful value.
- The id is **never** read from a request body (RFC 9110 §9.3.5); a DELETE names its target in the URL.
- `remove` receives the raw `express.Request` so the calling module can construct its own `CallerContext`; the service layer records its own audit row.
- The computed operation name (e.g. `deleteOrder`) appears in stack traces, the request log line, and the generated `docs/modules/` tables.
