---
source: src/modules/products/controllers/update-product.ts
sha256: 7118a60d1db7a0d79080abaec0fcdaae2a3544e306002e973e9afc6539935995
generated_at: 2026-10-15T11:41:12.393224+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/update-product.ts

## Purpose

Defines the `PUT /products/:id` (full replace) and `PATCH /products/:id` (partial merge) handlers for the products module. Both verbs are built on the shared `createUpdateController` factory and delegate the actual write to `productService.writeUpdate`. The only verb-specific behavior is what an *omitted* field means: PUT clears clearable fields and deletes omitted locales; PATCH leaves them untouched.

## Key elements

- **`replaceProduct` / `updateProduct`** (named exports) — destructured from a single `createUpdateController` call. `replaceProduct` handles PUT; `updateProduct` handles PATCH.
- **`input` mapping** — declares multipart type-coercion (`booleans`, `numbers`, `stringArrays`, `jsonFields`) so the same zod schema validates both JSON and multipart bodies.
- **`update` callback** — wraps `productService.writeUpdate` inside `writeWithUploadedImage`, threading the request's optional image upload and the caller context into the service call.
- **`keptWhenOmitted: ['imageUrl']`** — explicitly prevents PUT from clearing the image; the upload pipeline owns image lifecycle.
- **`completeReplace`** — PUT-only hook that calls `productService.clearOmittedLocales` to delete stored locale rows absent from the body.
- **`present`** — serializes the stored product via `productService.toProduct(product, request.caller)` for the response.

## Relationships

- **`create-update-controller.ts`** — supplies the `createUpdateController` factory; this file is purely its configuration + callbacks.
- **`request.ts`** — `callerContextOf(request)` extracts the authenticated caller identity, forwarded to `writeUpdate` for audit.
- **`uploads.ts`** — `writeWithUploadedImage(request, changes.imageUrl, cb)` reads an optional multipart image upload and passes the resolved image (or `null`) into the callback.
- **`routes.ts`** — registers `replaceProduct` / `updateProduct` on the `PUT` and `PATCH` routes for `/products/:id`.
- **`services/index.ts`** — source of `productService.writeUpdate`, `.clearOmittedLocales`, `.toProduct`, and the two zod schemas used for validation.

## Notes

- Validation uses `zodProductReplaceSchema` / `zodProductUpdateSchema` (custom, extended with a fallback-locale guard and a release-date rule) rather than raw generated schemas. A bad body 422s here with a field-named message; the service does not re-validate.
- `imageUrl` in the request body may only be `null` (explicit clear) or absent; the server always sets the actual URL. The multipart `imageUpload` part is **outside** the zod schema and is read separately by `writeWithUploadedImage`.
- PUT's "clear on omit" applies to `taxClass`, `rateType`, `sku`, `weight`, and omitted locales — **not** to `imageUrl`.
