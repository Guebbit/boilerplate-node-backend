/**
 * @module
 * Admin restore controller for the catalogue — thin wiring onto the shared
 * `createRestoreController` factory.
 */

import { createRestoreController } from '@infrastructure/surfaces/create-restore-controller';
import { callerContextOf } from '@infrastructure/http/request';
import { productService } from '../services';

/**
 * POST /products/:id/restore — undo a soft delete (admin). 409 when the product is not deleted.
 * `productService.restoreById` owns the `ADMIN_PRODUCT_RESTORED` audit emit.
 */
export const restoreProducts = createRestoreController({
    entity: 'product',
    restore: (id, request) => productService.restoreById(id, callerContextOf(request)),
    present: (product, request) => productService.toProduct(product, request.caller),
    notFoundKey: 'products.not-found'
});
