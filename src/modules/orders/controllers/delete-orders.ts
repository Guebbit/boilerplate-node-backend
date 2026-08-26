import { createDeleteController } from '@infrastructure/http/delete-controller';
import { orderService } from '../service';
import { ordersAuditActions } from '../audit';

/**
 * DELETE /orders — delete an order by id in the request body (admin).
 * DELETE /orders/:id — delete an order by path id (admin).
 * DELETE /orders/:id/hard — the same operation with the flag spelled in the path (admin).
 * Pass ?hardDelete=true to permanently delete; otherwise soft-deletes.
 *
 * An order is a financial record, so the soft path is the one it wants: the row survives and only
 * the stamp moves. The hard path releases the units the order still holds before destroying it.
 */
export const deleteOrders = createDeleteController({
    entity: 'order',
    remove: (id, hardDelete) => orderService.removeById(id, hardDelete),
    auditAction: ordersAuditActions.ORDER_DELETED,
    notFoundKey: 'orders.not-found'
});
