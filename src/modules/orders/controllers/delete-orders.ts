/**
 * @module
 * Admin delete controller for orders — thin wiring onto the shared `createDeleteController`
 * factory; see the exported controller's own JSDoc for behavior.
 */

import { createDeleteController } from '@infrastructure/surfaces/create-delete-controller';
import { orderService } from '../service';
import { ordersAuditActions } from '../audit';

/**
 * DELETE /orders(/:id)(/hard) — admin delete, soft by default; `?hardDelete=true` or `/hard`
 * makes it permanent. Hard delete releases the order's held units first; soft delete only moves
 * the deletion stamp, since an order is a financial record.
 */
export const deleteOrders = createDeleteController({
    entity: 'order',
    remove: (id, hardDelete) => orderService.removeById(id, hardDelete),
    auditAction: ordersAuditActions.ORDER_DELETED,
    notFoundKey: 'orders.not-found'
});
