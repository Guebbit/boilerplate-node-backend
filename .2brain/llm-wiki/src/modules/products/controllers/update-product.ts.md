---
source: src/modules/products/controllers/update-product.ts
sha256: 175dd7e5da088606cdf340a41400885bea29215d13552af1fe6c07128338686a
generated_at: 2026-09-27T15:31:32.663281+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/update-product.ts

## Purpose

Handler pair for `PUT /products/:id` (full replace) and `PATCH /products/:id` (partial merge), built on the shared `createUpdateController` factory. All actual writing delegates to `productService.writeUpdate`; the controller's job is body validation (via product-specific Zod schemas), multipart input decoding, and image-upload handling before the service call.

## Key elements

- **`replaceProduct`** – exported `PUT` handler. Validates body against `zodProductReplaceSchema`; omitted clearable fields (`taxClass`, `weight`, `imageUrl`) are cleared.
- **`updateProduct`** – exported `PATCH` handler. Validates against `zodProductUpdateSchema`; omitted clearable fields are left untouched. `translations` keeps the same per-locale upsert/delete semantics in both verbs.
- **`input` config** (passed to the factory) – declares which body fields are booleans, numbers, string arrays, or JSON so `readInput` can decode a multipart form before schema validation. `imageUpload` is intentionally outside the schema.
- **`update` callback** – wraps the write in `writeWithUploadedImage`. Server-derived `thumbnailUrl`/`pendingImageKey` are passed as `imageExtras` to `writeUpdate` rather than merged into `changes` (they would fail the factory's `strictObject` check). Only `imageUrl` is a contract field and joins `changes`.
- **`present` callback** – maps a product row through `productService.toProduct` for the response shape.

## Relationships

- **`create-update-controller`** – provides the `createUpdateController` factory that wires schema validation, 404 handling, and the PUT/PATCH split around the `update`/`present` callbacks defined here.
- **`productService`** – supplies `zodProductReplaceSchema`, `zodProductUpdateSchema`, `writeUpdate`, and `toProduct`. All writes, the 404 check, and audit emission live in the service, not this file.
- **`uploads`** – `writeWithUploadedImage` reads an optional multipart image upload from the request, returns derived `imageUrl`/`thumbnailUrl`/`pendingImageKey`, and invokes the callback.
- **`request`** – `callerContextOf` extracts the authenticated caller's context from the incoming request and forwards it to `writeUpdate`.
- **`routes.ts`** – registers `replaceProduct` and `updateProduct` on the `PUT` and `PATCH /products/:id` routes respectively.

## Notes

- Validation happens **here** (at the controller) with product-specific schemas that carry `products.field-price-*` messages and the fallback-locale guard. The service does **not** re-validate the body.
- `thumbnailUrl` and `pendingImageKey` are never in the client contract. They are threaded through `writeWithUploadedImage`'s callback and passed as the `imageExtras` parameter to avoid tripping the factory's `strictObject` schema check.
- Because multipart fields arrive as strings, the `input` config list is the single source of truth for coercion. Adding a new numeric/boolean/array/JSON field to the body requires adding it here as well as in the Zod schema.
