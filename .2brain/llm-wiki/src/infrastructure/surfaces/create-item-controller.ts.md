---
source: src/infrastructure/surfaces/create-item-controller.ts
sha256: 2d91095be3682831f30a6a56231b2db74837f3a6713c04dd95f596819e8163b2
generated_at: 2026-09-27T14:17:12.744436+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-item-controller.ts

## Purpose

Factory that builds a standard "read-one" Express handler for any entity. It centralizes the API contract that a malformed path id is a 404 (not a 500), that a missing row yields the module's own i18n key, and that the operation name is derived consistently for logs, stack traces, and generated docs. Modules supply only the fetch call, entity name, and 404 key; everything else is handled here.

## Key elements

- **`ItemControllerSpec`** (interface) — The four per-entity inputs: `entity` (singular name, e.g. `'product'`), `fetch` (callback receiving id and request, returning `Promise<unknown>`), `notFoundKey` (i18n key for the 404 body), and optional `handlerSuffix` to disambiguate multiple read-ones on the same entity.
- **`createItemController`** (exported function) — Accepts an `ItemControllerSpec`, derives the operation name via `operationName('get', entity, handlerSuffix ?? 'Item')`, and returns a `namedHandler` that calls `fetch`, sends `successResponse` on a truthy result, `rejectResponse(404)` on a falsy result, and delegates errors to `catchAsNotFound` (which maps CastError → 404, other DB errors → 500 via `rejectDatabaseError`).

## Relationships

- **`@infrastructure/http/controller`** — Imports `operationName` (builds the `get<Entity><Suffix>` identifier), `namedHandler` (attaches the name to the handler for logging), and `catchAsNotFound` (the error-catch strategy).
- **`@infrastructure/http/response`** — Imports `successResponse` (serializes the found row) and `rejectResponse` (sends the 404 with the i18n-translated key).
- **`@infrastructure/i18n`** — Imports `t` to translate `notFoundKey` at request time.
- **Consumers** (`get-product-item.ts`, `get-product-admin.ts`, `get-user-item.ts`) — Each calls `createItemController` with its own spec; `get-product-admin.ts` passes `handlerSuffix: 'Admin'` so the operation name becomes `getProductAdmin`.
- **`create-item-controller.test.ts`** — Unit tests covering the 404 paths (falsy result, CastError) and the success path.

## Notes

- Despite the filename saying "create-item," the handler it builds is a **GET** (read-one) operation. The word "create" refers to *creating the controller function*, not to a POST/PUT action.
- The `fetch` callback returns `unknown` on purpose: the controller never inspects the payload shape. A "miss" is any falsy value (`null`, `undefined`, `void`); everything truthy is serialized as-is.
- `handlerSuffix` exists solely to avoid operation-name collisions when an entity needs more than one read-one (e.g., `getProductItem` vs. `getProductAdmin`). Without it the default suffix is `'Item'`.
- The `request` is passed into `fetch` because visibility filtering (scope, permission) is a caller-side concern; this controller stays agnostic of which entity it serves.
