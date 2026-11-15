---
source: src/modules/products/controllers/update-product.ts
sha256: 4ed9ea0d67949cab6da88e6e80658f0c3ad07bd9762da94420a964236084b72b
generated_at: 2026-11-14T21:23:10.223349+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/update-product.ts

## Purpose

Defines the two write handlers for product modification — `PUT /products/:id` (full replace) and `PATCH /products/:id` (partial merge) — by configuring a single `createUpdateController` instance. All business logic (404 check, audit emit, locale management) lives in `productService`; this file only wires validation, content-type decoding, image-upload handling, and the verb-specific omission semantics to that service.

## Key elements

- **`replaceProduct`** (export) — The `PUT` handler. On omission, clears the mutable fields (`taxClass`, `rateType`, `sku`, `weight`) and deletes any stored locale not present in the body's `translations`. `imageUrl` is exempt: omitting it preserves the current image.
- **`updateProduct`** (export) — The `PATCH` handler. Omitted fields are left untouched; no locale cleanup occurs.
- **`createUpdateController` configuration** — A single object that parameterises both handlers:
  - `replaceSchema` / `patchSchema` — `productService.zodProductReplaceSchema` and `productService.zodProductUpdateSchema`. These add a fallback-locale guard and a release-date rule on top of the generated body schemas, so a bad write 422s at the controller layer rather than being re-checked inside the service.
  - `input` — Declares which fields are booleans, numbers, string arrays, or JSON so the factory can decode multipart form values into JSON-shaped values before schema validation.
  - `update` — Callback that runs `writeWithUploadedImage` → `productService.updateById`, passing the caller context (from `callerContextOf`) and the resolved image.
  - `keptWhenOmitted: ['imageUrl']` — Prevents a PUT from clearing the image when the field is simply absent.
  - `completeReplace` — Calls `productService.clearOmittedLocales(id, changes)` to null out locales missing from a PUT body.
  - `present` — Calls `productService.presentForCaller` to shape the response for the requesting caller.

## Relationships

- **`create-update-controller.ts` (infrastructure/surfaces)** — The factory that this file configures. It owns the HTTP verb dispatch, 404 handling, versioning, and the PUT-vs-PATCH omission logic; this file supplies the schemas, input decoding rules, and the actual `update`/`completeReplace`/`present` callbacks.
- **`request.ts` (infrastructure/http)** — Provides `callerContextOf`, used inside the `update` callback to extract the authenticated caller's identity for the service call.
- **`uploads.ts` (infrastructure/http)** — Provides `writeWithUploadedImage`, which reads an optional multipart image field, resolves the server-side image URL, and hands it to the service as `imageExtras`.
- **`services/index.ts` (modules/products)** — Exports the `productService` object used here; this file calls its `updateById`, `clearOmittedLocales`, and `presentForCaller` methods and consumes its two Zod schemas. All business rules and persistence live there.
- **`routes.ts` (modules/products)** — Upstream consumer that mounts `replaceProduct` on `PUT /products/:id` and `updateProduct` on `PATCH /products/:id`.

## Notes

- Image fields are **server-decided**: the request body may only carry `imageUrl: null` (to explicitly clear) or omit it (to keep). The actual image data arrives via a multipart `imageUpload` part read by `writeWithUploadedImage` and is **not** part of the Zod schema.
- `PUT` omits are destructive for `taxClass`, `rateType`, `sku`, `weight`, and locales; `PATCH` omits are inert. `imageUrl` is never cleared by omission in either verb.
- The `input` block exists solely so one JSON-shaped schema validates both `application/json` and `multipart/form-data` bodies; `readInput` (inside the factory) coerces the raw form strings before Zod runs.
