/**
 * @module
 * Admin restore controller for the catalogue — thin wiring onto the shared
 * `createRestoreController` factory.
 */

import { createRestoreController } from '@infrastructure/surfaces/create-restore-controller';
import { productService } from '../service';
import { productsAuditActions } from '../audit';

/** POST /products/:id/restore — undo a soft delete (admin). 409 when the product is not deleted. */
export const restoreProducts = createRestoreController({
    entity: 'product',
    restore: (id) => productService.restoreById(id),
    present: (product) => productService.toProduct(product),
    auditAction: productsAuditActions.ADMIN_PRODUCT_RESTORED,
    notFoundKey: 'products.not-found'
});
