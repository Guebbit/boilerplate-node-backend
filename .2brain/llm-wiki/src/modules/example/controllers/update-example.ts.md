---
source: src/modules/example/controllers/update-example.ts
sha256: 5abdbe309be8f25af23d2e54be8ab98a72ee626fe2cc4d75f40959cd7b1dbcd9
generated_at: 2026-11-14T19:58:15.363954+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/update-example.ts

## Purpose

Defines the `PUT` (full replace) and `PATCH` (partial merge) handlers for `/examples/:id`. Both share a single pipeline built by the `createUpdateController` factory (which owns the id lookup, `If-Match` validation, and `ETag` response). This file supplies only what is module-specific: the two body schemas and the service call.

## Key elements

- **`replaceTrimmedBody`** – Zod schema for `PUT` bodies. Extends `ReplaceExampleByIdBody`, wrapping `title` and `body` with `trimmedInto` so whitespace-only values are rejected at the field level (422) rather than stored as blank columns.
- **`updateTrimmedBody`** – Zod schema for `PATCH` bodies. Extends `UpdateExampleByIdBody`; `title` uses the custom `trimmedExampleTitle` rule, `body` uses `trimmedInto`. Both fields remain optional so an omitted field stays omitted.
- **`replaceExample` / `updateExample`** (named exports) – The handler pair returned by `createUpdateController`. `replaceExample` handles `PUT`, `updateExample` handles `PATCH`. Both delegate to the example service's update method.

## Relationships

- **`create-update-controller.ts`** – Supplies the `createUpdateController` factory. This file passes `versioned`, `entity`, `notFoundKey`, both schemas, the `update` callback, and the `present` mapper.
- **`request.ts`** – Imports `callerContextOf` to extract the authenticated caller's context for the service call.
- **`schemas.ts`** – Imports `trimmedInto`, a helper that wraps an existing Zod schema string with trim-before-validation logic.
- **`title-rule.ts`** – Imports `trimmedExampleTitle`, the module-specific title validation rule used in the `PATCH` schema.
- **`src/modules/example/services/index.ts`** – Exports `exampleService`; the factory's `update` callback invokes a method on that service with the id, changes, and caller context.
- **`routes.ts`** – Consumes the `replaceExample` and `updateExample` exports to register them on the router for `PUT` and `PATCH /examples/:id`.

## Notes

- The `present` mapper is a pass-through (`example => example`) because the service already returns the contract's shape. No re-mapping is needed here.
- `title` in the PATCH schema uses `trimmedExampleTitle` (from `title-rule.ts`) rather than the generic `trimmedInto`, indicating the title field has additional module-specific validation beyond trimming.
- `notFoundKey` is set to `'example.not-found'`; the factory uses this to look up the i18n message for 404 responses.
- The doc header references `docs/api/write-methods.md` for the broader PUT/PATCH contract.
