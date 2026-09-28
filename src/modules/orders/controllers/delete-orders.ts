/**
 * @module
 * Admin delete controller for orders — thin wiring onto the shared `createDeleteController`
 * factory; see the exported controller's own JSDoc for behavior.
 */

import { createDeleteController } from '@infrastructure/surfaces/create-delete-controller';
import { callerContextOf } from '@infrastructure/http/request';
import { orderService } from '../services';

/**
 * DELETE /orders(/:id)(/hard) — admin delete, soft by default; `?hardDelete=true` or `/hard`
 * makes it permanent. Hard delete releases the order's held units first; soft delete only moves
 * the deletion stamp, since an order is a financial record. `orderService.removeById` owns the
 * `ORDER_DELETED` audit emit.
 */
export const deleteOrders = createDeleteController({
    entity: 'order',
    remove: (id, hardDelete, request) =>
        orderService.removeById(id, hardDelete, callerContextOf(request)),
    notFoundKey: 'orders.not-found'
});
