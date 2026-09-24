/**
 * @module
 * Admin restore controller for orders — thin wiring onto the shared `createRestoreController`
 * factory.
 */

import { createRestoreController } from '@infrastructure/surfaces/create-restore-controller';
import { orderService } from '../services';
import { ordersAuditActions } from '../audit';

/** POST /orders/:id/restore — undo a soft delete (admin). 409 when the order is not deleted. */
export const restoreOrders = createRestoreController({
    entity: 'order',
    restore: (id) => orderService.restoreById(id),
    present: (order, request) => orderService.withActions(order, request.authContext),
    auditAction: ordersAuditActions.ORDER_RESTORED,
    notFoundKey: 'orders.not-found'
});
