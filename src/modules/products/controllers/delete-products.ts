/**
 * @module
 * Admin delete controller for the catalogue — thin wiring onto the shared
 * `createDeleteController` factory; see the exported controller's own JSDoc for behavior.
 */

import { createDeleteController } from '@infrastructure/surfaces/create-delete-controller';
import { productService } from '../service';
import { productsAuditActions } from '../audit';

/**
 * DELETE /products/:id — delete a product by path id (admin). `?hardDelete=true` deletes
 * permanently; otherwise soft-deletes. The hard path also announces `PRODUCT_DELETED` and removes
 * the image, so a deleted product does not outlive itself in a wishlist or on disk.
 */
export const deleteProducts = createDeleteController({
    entity: 'product',
    remove: (id, hardDelete) => productService.removeById(id, hardDelete),
    auditAction: productsAuditActions.ADMIN_PRODUCT_DELETED,
    notFoundKey: 'products.not-found'
});
