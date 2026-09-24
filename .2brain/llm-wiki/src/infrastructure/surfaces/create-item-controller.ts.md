---
source: src/infrastructure/surfaces/create-item-controller.ts
sha256: 2ba21b1839c7f1b87a4d73b5e83c28420d654c22bf470e3888ff58aa024d44bf
generated_at: 2026-09-23T17:53:39.265299+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-item-controller.ts

## Purpose

A generic factory that builds a "read-one-by-id" Express handler for any entity. It centralizes the API-contract decision that a well-formed id returning no row **and** a malformed id (Mongoose `CastError`) both produce a 404 with the module's own i18n key, while any other rejection is delegated to `catchAsNotFound`. Each module supplies only the three things that differ (entity name, fetch function, not-found key) and gets back a fully-wired, consistently named handler.

## Key elements

- **`ItemControllerSpec`** (interface) — per-entity configuration: `entity` (lower-case singular name used to derive the operation), `fetch(id, request)` (module-specific data access; returns `unknown`), `notFoundKey` (i18n key for the 404 message).
- **`createItemController(spec)`** (exported const) — builds and returns a named Express handler. Extracts `request.params.id`, calls `spec.fetch`, responds 200 with the item or 404 with the translated `notFoundKey`, and routes any thrown/rejected error through `catchAsNotFound`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `operationName` (derives the `get<Entity>Item` label), `namedHandler` (wraps the handler with a stable name for logging/stack-traces), and `catchAsNotFound` (catches rejections, maps `CastError` → 404, passes other errors to `rejectDatabaseError`).
- **`src/infrastructure/http/response.ts`** — provides `successResponse` (200 + body) and `rejectResponse` (4xx + error array) used for the two terminal responses.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — provides `t()` to resolve `notFoundKey` into a localized string at request time.
- **`src/modules/products/controllers/get-product-item.ts`** and **`src/modules/users/controllers/get-user-item.ts`** — consumers that call `createItemController` with a product- or user-specific `ItemControllerSpec` (entity name, scoped fetch, and module-specific 404 key).

## Notes

- `spec.fetch` receives the full Express `Request` because visibility/scope is a property of the **caller** (e.g. products filter by `callerScope`, users sit behind `requirePermission`). The controller itself never inspects the item.
- `fetch` is typed to return `Promise<unknown>`; the controller only checks truthiness. A miss is whatever the service answers for "none" (`null`, `undefined`, or `void`)—the controller does not coerce it.
- The operation name is always `get<Entity>Item` (e.g. `getProductItem`). This string appears in log lines, stack traces, and generated `docs/modules/` tables, so it must stay stable per entity.
- The "malformed id → 404, not 500" rule is enforced once here (via `catchAsNotFound`), not re-implemented in each module.
