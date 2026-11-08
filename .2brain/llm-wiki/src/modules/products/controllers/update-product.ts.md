---
source: src/modules/products/controllers/update-product.ts
sha256: 36a5de80ea7c0559ff50ea9fdac6eb574c8cde05d2d945a0e509ebf2a4cdbbf7
generated_at: 2026-11-08T07:43:10.576390+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/update-product.ts

## Purpose

Builds the `PUT /products/:id` (replace) and `PATCH /products/:id` (merge) handlers for the product entity. It is a thin controller layer: it handles input decoding (multipart ↔ JSON), body validation, image-upload plumbing, and the PUT-only "clear omitted" semantics, then delegates the actual write to `productService.updateById`.

## Key elements

- **`replaceProduct`** — the `PUT` handler. An omitted clearable field (`taxClass`, `rateType`, `sku`, `weight`) is nulled; every stored locale absent from `translations` is deleted via `clearOmittedLocales`. `imageUrl` is the one exception (kept if omitted).
- **`updateProduct`** — the `PATCH` handler. Omitted fields and locales are left untouched; only explicitly provided fields are written.
- Both are destructured from a single `createUpdateController({ … })` call, sharing the same service call, validation schemas, and response serialization.
- **`input` config** — declares which body fields arrive as strings in multipart form (`booleans`, `numbers`, `stringArrays`, `jsonFields`) so the factory's `readInput` step coerces them before the shared zod schema validates.

## Relationships

- **`createUpdateController`** (`@infrastructure/surfaces/create-update-controller`) — the factory that produces the paired `replace`/`update` handlers from the config object exported here. All HTTP boilerplate (404, 422, serialization) lives in that factory.
- **`productService`** (`../services`) — the sole business-logic dependency. The controller calls `updateById` (write + 404 + audit), `clearOmittedLocales` (PUT-only locale deletion), `toProduct` (response shaping), and consumes `zodProductReplaceSchema` / `zodProductUpdateSchema` for validation.
- **`writeWithUploadedImage`** (`@infrastructure/http/uploads`) — wraps the service call so a multipart image upload is read and persisted before `updateById` runs; the resulting `image` extras are passed as the service's `imageExtras` parameter.
- **`callerContextOf`** (`@infrastructure/http/request`) — extracts the authenticated caller context from the request and forwards it to `updateById` (audit) and `toProduct` (permission-aware serialization).
- **`routes.ts`** (`../routes`) — the routing layer that maps the URL methods to `replaceProduct` / `updateProduct`.

## Notes

- **Validation is controller-local, not service-local.** The zod schemas (`zodProductReplaceSchema`, `zodProductUpdateSchema`) add a fallback-locale guard and a release-date rule on top of the generated body schema. `updateById` does *not* re-validate; a bad body 422s here, at the single validation point.
- **`imageUrl` is server-decided.** The body may only send `null` (to clear). An actual image is read from the multipart upload by `writeWithUploadedImage` and passed as `imageExtras`—it never goes through the zod schema.
- **`keptWhenOmitted: ['imageUrl']`** is what makes the PUT "replace" semantics intentionally *not* full-replace: a PUT that simply omits the image keeps the current one, because the client cannot re-upload the same file.
- **Multipart string coercion** happens in the factory's `readInput` step *before* schema validation, so one JSON-shaped zod schema serves both `application/json` and `multipart/form-data`.
