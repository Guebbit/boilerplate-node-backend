/**
 * @module
 * Controllers for `PUT /products/:id` (replace) and `PATCH /products/:id` (merge), built on the
 * shared `createUpdateController` factory. Both verbs delegate the product write and the
 * translation-row merge to `productService.writeUpdate`, which already owns the 404 check and the
 * audit emit — the verb difference is entirely in which schema validates the body and whether an
 * omitted clearable field (`taxClass`/`weight`/`imageUrl`) is cleared or left alone; `translations`
 * keeps the same per-locale upsert/delete semantics either way (see `PUT`'s own operation
 * description for why a translations table isn't a "whole-body replace" field).
 */

import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { ReplaceProductByIdBody, UpdateProductByIdBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { writeWithUploadedImage } from '@infrastructure/http/uploads';
import { productService } from '../service';

export const { replace: replaceProduct, update: updateProduct } = createUpdateController({
    entity: 'productById',
    replaceSchema: ReplaceProductByIdBody,
    patchSchema: UpdateProductByIdBody,
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
        // `thumbnailUrl`/`pendingImageKey` are server-derived, never on the contract —
        // `writeUpdate`'s own `imageExtras` parameter carries them PAST its internal Zod parse
        // (a `strictObject`, which would refuse them as unknown fields if merged into `changes`
        // instead). Only `imageUrl` is a real contract field, so only it joins `changes`.
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
