import { orderService } from '@services/orders';
import { createDeleteController } from '@utils/helpers-request';
import { AuditAction } from '@utils/audit';

/**
 * DELETE /orders — delete an order by id in the request body (admin).
 * DELETE /orders/:id — delete an order by path id (admin).
 */
export const deleteOrders = createDeleteController({
    entityLabel: 'deleteOrder',
    notFoundKey: 'ecommerce.order-not-found',
    auditAction: AuditAction.ADMIN_ORDER_DELETED,
    targetType: 'order',
    remove: (id) => orderService.remove(id)
});
