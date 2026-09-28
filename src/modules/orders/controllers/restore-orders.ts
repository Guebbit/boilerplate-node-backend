/**
 * @module
 * Admin restore controller for orders — thin wiring onto the shared `createRestoreController`
 * factory.
 */

import { createRestoreController } from '@infrastructure/surfaces/create-restore-controller';
import { callerContextOf } from '@infrastructure/http/request';
import { orderService } from '../services';

/**
 * POST /orders/:id/restore — undo a soft delete (admin). 409 when the order is not deleted.
 * `orderService.restoreById` owns the `ORDER_RESTORED` audit emit.
 */
export const restoreOrders = createRestoreController({
    entity: 'order',
    restore: (id, request) => orderService.restoreById(id, callerContextOf(request)),
    present: (order, request) => orderService.withActions(order, request.authContext),
    notFoundKey: 'orders.not-found'
});
