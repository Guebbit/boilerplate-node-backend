---
source: src/infrastructure/surfaces/create-item-controller.ts
sha256: 3fd95ebea13fcaa506a428dda4799636eebc6163879143e1dd01ebcd2eff63ea
generated_at: 2026-10-29T02:17:10.288830+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-item-controller.ts

## Purpose

Factory that builds a module's **read-one** (fetch-by-ID) Express handler. It centralises the contract that a malformed path parameter answers as a 404 (not a 400), that a missing row uses the module's own i18n key, and that successful responses carry an `ETag`. Modules call it once with an entity-specific spec instead of repeating this logic inline.

## Key elements

- **`ItemControllerSpec`** (interface) — the per-entity configuration: `entity` (singular lowercase name, e.g. `'product'`), `fetch(id, request) → Promise<unknown>` (the row lookup; returns a falsy value on miss), and `notFoundKey` (i18n key for the 404 body).
- **`createItemController(spec)`** (exported factory) — returns a named Express handler. Derives the operation name via `operationName('get', entity, 'Item')` (e.g. `getProductItem`). On call: validates the path param with `requireId`, calls `fetch`, then either 404s with `t(notFoundKey)`, or serialises the row with `successResponse` after setting an `ETag`. Errors are funnelled through `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — supplies `namedHandler` (wraps the handler with a display name), `operationName` (builds `get<Entity>Item`), and `catchAs` (maps thrown errors to an error response).
- **`@infrastructure/http/ids`** — supplies `requireId`, which validates the path parameter is a well-formed ID *before* the database is touched and emits the 404 when it isn't.
- **`@infrastructure/http/preconditions`** — supplies `setEtag`, which stamps the response with a version token for `If-Match` on subsequent edits.
- **`@infrastructure/http/response`** — supplies `successResponse` (200/201 body) and `rejectResponse` (404 body with i18n message).
- **`@infrastructure/i18n`** — supplies `t`, the translation function used to resolve `notFoundKey` into a human-readable string.
- **Module consumers** (`get-product-item`, `get-user-item`, `get-subscription`, `get-example`) — each calls `createItemController` with its own `fetch` (which may apply `callerScope`, `requirePermission`, etc.) and a module-specific `notFoundKey`.
- **`tests/unit/infrastructure/surfaces/create-item-controller.test.ts`** — unit tests for the factory's 404, ETag, and error paths.

## Notes

- `fetch` receives the full Express `Request` because visibility rules are **caller-specific** (e.g. products narrow by scope, users check permissions). The controller itself never inspects the row — it only checks truthiness for the 404 path and passes the value through to `successResponse`.
- A malformed ID and a missing row are deliberately **indistinguishable** to the caller (both 404, same i18n key). This is an intentional API-contract decision, not an oversight.
- The `entity` string is singular lowercase (`'product'`, not `'Product'` or `'products'`); it feeds `operationName` so log lines, stack traces, and generated `docs/modules/` tables all agree.
