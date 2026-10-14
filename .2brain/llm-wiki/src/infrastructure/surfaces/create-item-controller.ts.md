---
source: src/infrastructure/surfaces/create-item-controller.ts
sha256: a6416d516c585b167db9b0f234aa5fc8104b702195cdfc190f7dbd0924de30a1
generated_at: 2026-10-14T08:18:49.823752+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-item-controller.ts

## Purpose

A factory that builds the "read-one" (fetch-by-path-id) Express handler for any entity. It centralises the API contract decision that a malformed or missing id returns the module's own 404 (not a 500), so that behaviour has a single landing site rather than being repeated inline in every module.

## Key elements

- **`ItemControllerSpec`** (interface) — The four per-entity parameters: `entity` (lowercase singular name used to build the operation name), `fetch` (async callback that receives the id *and* the request, returns `unknown`; `null`/`undefined`/`void` means "not found"), `notFoundKey` (i18n key for the 404 body), and optional `handlerSuffix` (replaces the default `'Item'` in the generated name, e.g. `'Admin'` → `getProductAdmin`).
- **`createItemController`** (function, default export pattern) — Takes an `ItemControllerSpec` and returns a named Express handler. Handler flow: `requireId` → early-return on bad id → `fetch` → 404 if falsy result, otherwise `setEtag` + `successResponse` → `.catch(catchAs)` for unexpected errors.

## Relationships

- **`@infrastructure/http/controller`** — Provides `namedHandler` (wraps the handler with a name for logging/stack traces), `operationName` (builds `get<Entity><Suffix>`), and `catchAs` (error-to-response mapping scoped to the operation name).
- **`@infrastructure/http/ids`** — `requireId` validates the path parameter *before* any database call; returns `null` and writes the 404 itself when the id is malformed.
- **`@infrastructure/http/response`** — `successResponse` (200 with body) and `rejectResponse` (404 with i18n message).
- **`@infrastructure/http/preconditions`** — `setEtag` computes and sets the `ETag` header from the fetched row so clients can `If-Match` it on subsequent edits.
- **`@infrastructure/i18n`** — `t` translates `notFoundKey` into the 404 response body.
- **Consumers** (module controllers): `get-example.ts`, `get-product-item.ts`, `get-product-admin.ts`, `get-user-item.ts` each call `createItemController` with their own spec, providing the entity-specific `fetch` closure (which may scope by caller role, permission, etc.).
- **`tests/unit/infrastructure/surfaces/create-item-controller.test.ts`** — Unit-tests the factory in isolation.

## Notes

- The `fetch` callback is deliberately typed to return `unknown`; the controller never inspects the row's shape. A "miss" is any falsy value the service returns — the controller does not distinguish `null` from `void`.
- `handlerSuffix` exists to disambiguate a second read-one on the same entity (e.g. `getProductAdmin` vs `getProductItem`). Without it, both would generate the same operation name.
- The `fetch` function receives the full `Request` object so that visibility rules (caller scope, permission checks) live in the module's service call, not in this shared controller.
