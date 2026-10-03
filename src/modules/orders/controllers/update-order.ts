/**
 * @module
 * Controllers for `PUT /orders/:id` (replace) and `PATCH /orders/:id` (merge), built on the
 * shared `createUpdateController` factory. `email` is the only writable field either verb may
 * set — `status` moves only through an action endpoint, never a field on this body (see the
 * route's own contract description).
 */

import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { ReplaceOrderByIdBody, UpdateOrderByIdBody } from '@api/schemas.zod';
import { orderService } from '../services';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * `PUT` and `PATCH /orders/:id` — one handler pair over `orderService.updateById`, which already
 * owns the 404 check and the audit emit.
 */
export const { replace: replaceOrderById, update: updateOrderById } = createUpdateController({
    entity: 'orderById',
    notFoundKey: 'orders.not-found',
    replaceSchema: ReplaceOrderByIdBody,
    patchSchema: UpdateOrderByIdBody,
    update: (id, changes, request) =>
        orderService.updateById(id, changes, callerContextOf(request)),
    present: (order, request) => orderService.withActions(order, request.authContext)
});
