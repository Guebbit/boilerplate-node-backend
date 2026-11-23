---
source: src/modules/products/controllers/update-product.ts
source_sha256: cbd8de2b61d5dd91309291ebe10ea5f809d84b7e473f12424895a39692aec0a9
context_sha256: 4965f0ce10776b242c43c84f03f6bb257ff527ff4b96b39473b8e677d235ab6d
generated_at: 2026-11-22T07:08:23.729571+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/controllers/update-product.ts

## Purpose
Defines the HTTP controllers for `PUT /products/:id` (replace) and `PATCH /products/:id` (merge). Both are built from the shared `createUpdateController` factory and delegate the product write and translation rows to `productService.updateById`, which owns the 404 check and the audit emit.

## Key elements
- `replaceProduct` (PUT) and `updateProduct` (PATCH): the two handlers destructured from one `createUpdateController({...})` call.
- `replaceSchema` / `patchSchema`: `productService.zodProductReplaceSchema` and `zodProductUpdateSchema`. These add the fallback-locale guard and the release-date rule on top of the generated body schema, so bad writes return 422 with a field-named message at this single validation point.
- `input`: lists the fields a multipart body sends as strings, so `readInput` decodes them before validation. One JSON-shaped schema therefore covers both content types.
  - booleans: `active`, `purchasable`, `allowBackorder`, `requiresShipping`, `noWithdrawal`
  - numbers: `weight`
  - string arrays: `categories`, `tags`
  - JSON fields: `translations`
- `update(id, changes, request)`: wraps `productService.updateById` in `writeWithUploadedImage`, passing the caller context from `callerContextOf(request)` and the uploaded image as `updateById`'s `imageExtras` parameter.
- `keptWhenOmitted: ['imageUrl']`: a PUT that omits the image keeps it, because a client cannot send the current image back.
- `completeReplace`: PUT only. Calls `productService.clearOmittedLocales` so every stored locale missing from `translations` becomes a `null` delete.
- `present`: formats the result via `productService.presentForCaller(product, request.caller)`.
- Factory options `versioned: true`, `entity: 'productById'` and `notFoundKey: 'products.not-found'` are passed through as configuration.

## Relationships
- `@infrastructure/surfaces/create-update-controller`: supplies the factory that implements the PUT/PATCH behavior from this config.
- `@infrastructure/http/request`: provides `callerContextOf`, used to build the caller context for the write.
- `@infrastructure/http/uploads`: provides `writeWithUploadedImage`, which reads `imageUpload` and supplies the image to the write.
- `../services` (`productService`): supplies the schemas, `updateById`, `clearOmittedLocales` and `presentForCaller`.
- `src/modules/products/routes.ts`: the route module that wires these exports to the endpoints.

## Notes
- **PUT vs PATCH:** the only difference is what omission means. A PUT clears omitted clearable fields (`taxClass`, `rateType`, `sku`, `weight`) and deletes unlisted locales. A PATCH leaves both alone.
- **Image handling:** a PUT never clears the image, since an upload owns it. The body's `imageUrl` can only be `null`, and the image fields are server-decided, passed past the factory's validation.
- `imageUpload` is outside the schema. `readUploadedImage`, inside `writeWithUploadedImage`, reads it.
