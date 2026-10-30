---
source: src/modules/products/controllers/update-product.ts
sha256: ae16b210abe60a687d0e203d7c42fb36062adafdfb2177a5d7575c88b5113db3
generated_at: 2026-10-29T05:25:21.980307+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/update-product.ts

## Purpose

Defines the `PUT /products/:id` (full replace) and `PATCH /products/:id` (partial merge) handlers. Both verbs funnel into `productService.updateById`; the only difference is what an *omitted* field means — PUT clears clearable fields and deletes omitted locales, PATCH leaves them untouched.

## Key elements

- **`replaceProduct` / `updateProduct`** — the two exported handlers, produced by a single `createUpdateController(…)` call.
- **`createUpdateController` config** — wires in:
  - `replaceSchema` / `patchSchema` (`productService.zodProductReplaceSchema` / `zodProductUpdateSchema`) — validated once here, not inside `updateById`.
  - `input` — declares which fields need type-decoding for multipart bodies (booleans, numbers, string-arrays, JSON).
  - `update` callback — calls `writeWithUploadedImage`, which in turn calls `productService.updateById(id, changes, callerContext, image)`.
  - `keptWhenOmitted: ['imageUrl']` — a PUT that omits `imageUrl` does **not** clear it.
  - `completeReplace` — PUT-only hook that calls `productService.clearOmittedLocales(id, changes)`.
  - `present` — maps the stored row to the response via `productService.toProduct`.

## Relationships

- **`create-update-controller.ts`** — provides the `createUpdateController` factory that builds both handlers and owns the verb-specific omission logic.
- **`request.ts`** — provides `callerContextOf(request)` to extract the authenticated caller's identity for the service call.
- **`uploads.ts`** — provides `writeWithUploadedImage`, which reads a multipart image (if present) and passes the resolved image to the inner update call.
- **`services/index.ts`** — the `productService` is the sole write target (`updateById`, `clearOmittedLocales`, `toProduct`) and also the source of the two Zod schemas.
- **`routes.ts`** — imports `replaceProduct` / `updateProduct` to attach them to the `PUT`/`PATCH` route definitions.

## Notes

- Validation is **single-pass**: the Zod schemas run in the controller (via the factory), so `updateById` never re-validates the body. A bad write 422s with a field-named message here.
- `imageUpload` lives **outside** the Zod schema; it is read inside `writeWithUploadedImage` → `readUploadedImage`. The schema only sees `imageUrl: null | undefined`.
- Multipart bodies arrive as strings; the `input` block tells the factory's `readInput` step which fields to cast before schema validation, so one JSON-shaped schema covers both `application/json` and `multipart/form-data`.
- The set of clearable-on-PUT fields (`taxClass`, `rateType`, `sku`, `weight`) is implicit in the schema/factory, not enumerated in this file. `imageUrl` is explicitly excluded via `keptWhenOmitted`.
