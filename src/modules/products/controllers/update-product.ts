/**
 * @module
 * Controllers for `PUT /products/:id` (replace) and `PATCH /products/:id` (merge), built on the
 * shared `createUpdateController` factory. Both verbs delegate the product write and the
 * translation-row merge to `productService.writeUpdate`, which already owns the 404 check and the
 * audit emit — the verb difference is entirely in which schema validates the body and whether an
 * omitted clearable field (`taxClass`/`rateType`/`weight`/`imageUrl`) is cleared or left alone; `translations`
 * keeps the same per-locale upsert/delete semantics either way (see `PUT`'s own operation
 * description for why a translations table isn't a "whole-body replace" field).
 */

import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { callerContextOf } from '@infrastructure/http/request';
import { writeWithUploadedImage } from '@infrastructure/http/uploads';
import { productService } from '../service';

/**
 * `PUT` and `PATCH /products/:id` — one handler pair over `productService.writeUpdate`.
 * Validated against `zodProductReplaceSchema`/`zodProductUpdateSchema`, not the raw generated
 * schemas: they carry the custom `products.field-price-*` messages and the fallback-locale guard,
 * so a bad price 422s with its field-named message here, at the one place the body is validated,
 * rather than a generic one from a schema `writeUpdate` would otherwise have to re-check.
 */
export const { replace: replaceProduct, update: updateProduct } = createUpdateController({
    entity: 'productById',
    replaceSchema: productService.zodProductReplaceSchema,
    patchSchema: productService.zodProductUpdateSchema,
    // A multipart body carries these as strings; `readInput` decodes them before validation runs,
    // so one JSON-shaped schema above validates both content types (`imageUpload` itself is
    // outside the schema — `readUploadedImage`, inside `writeWithUploadedImage`, reads it).
    input: {
        booleans: ['active', 'requiresShipping'],
        numbers: ['price', 'weight'],
        stringArrays: ['categories', 'tags'],
        jsonFields: ['translations']
    },
    update: (id, changes, request) =>
        // `thumbnailUrl`/`pendingImageKey` are server-derived, never on the contract — carried
        // PAST the factory's `strictObject` validation (which would refuse them as unknown fields
        // if merged into `changes` instead) as `writeUpdate`'s own `imageExtras` parameter. Only
        // `imageUrl` is a real contract field, so only it joins `changes`.
        writeWithUploadedImage(
            request,
            changes.imageUrl,
            ({ imageUrl, thumbnailUrl, pendingImageKey }) =>
                productService.writeUpdate(id, { ...changes, imageUrl }, callerContextOf(request), {
                    thumbnailUrl,
                    pendingImageKey
                })
        ),
    present: (product) => productService.toProduct(product)
});
