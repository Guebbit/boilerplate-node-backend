/**
 * @module
 * Controllers for `PUT /products/:id` (replace) and `PATCH /products/:id` (merge), built on the
 * shared `createUpdateController` factory. Both verbs delegate the product write and the
 * translation rows to `productService.writeUpdate`, which already owns the 404 check and the
 * audit emit. The verb difference is only what an omission means: a PUT clears an omitted
 * clearable field (`taxClass`/`rateType`/`sku`/`weight`/`imageUrl`) and deletes every stored
 * locale its `translations` leaves out; a PATCH leaves both alone.
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
        // The image fields are server-decided (the body's `imageUrl` can only be `null`) —
        // carried PAST the factory's validation as `writeUpdate`'s own `imageExtras` parameter.
        writeWithUploadedImage(request, changes.imageUrl, (image) =>
            productService.writeUpdate(id, changes, callerContextOf(request), image)
        ),
    // PUT only: every locale the product holds and the body left out becomes a `null` delete.
    completeReplace: (id, changes) => productService.clearOmittedLocales(id, changes),
    present: (product) => productService.toProduct(product)
});
