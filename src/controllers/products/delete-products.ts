import { productService } from '@services/products';
import { createDeleteController } from '@utils/helpers-request';
import { AuditAction } from '@utils/audit';

/**
 * DELETE /products/:id
 * Delete a product by path id (admin).
 * Pass ?hardDelete=true to permanently delete; otherwise soft-deletes.
 */
export const deleteProducts = createDeleteController({
    entityLabel: 'deleteProduct',
    notFoundKey: 'ecommerce.product-not-found',
    auditAction: AuditAction.ADMIN_PRODUCT_DELETED,
    targetType: 'product',
    remove: (id, hardDelete) => productService.remove(id, !!hardDelete),
    supportsHardDelete: true
});
