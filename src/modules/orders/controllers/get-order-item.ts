/**
 * @module
 * Single-order read controller, scoped by caller role; see the exported controller's own JSDoc
 * for the 404-vs-422 distinction this file enforces before the query runs.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { isValidObjectId } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';

/**
 * GET /orders/:id
 * Get a single order by path id.
 * Non-admin users can only access their own orders.
 *
 * An id that is not a usable ObjectId answers 404 here, the same as on every other single-item read
 * (`get-product-item.ts`, `get-user-item.ts`): it names no order, which is the same thing a
 * well-formed id matching nothing means.
 *
 * The ANSWER is shared; the mechanism is not. Those two let the query run and map the Mongoose
 * `CastError` it raises (`error.kind === 'ObjectId'`) to the 404 in their `.catch`. This one checks
 * BEFORE the query, because its two role branches fail differently: the admin branch is a
 * `findById` and raises that same `CastError`, while the scoped branch is an aggregate whose
 * `$match` coerces the id itself and raises a driver `BSONError` — which the response layer reads
 * as 422. Answering on the error class here would therefore make the status depend on WHO asked,
 * for the same malformed value, so the check has to happen where neither branch has run yet.
 */
export const getOrderItem = (request: Request<{ id?: string }>, response: Response) => {
    if (!isValidObjectId(request.params.id)) {
        rejectResponse(response, 404, [t('orders.not-found')]);
        return;
    }

    /**
     * User role filters:
     * Only admin can see all orders. Regular users can only see their own.
     */
    return orderService
        .getById(request.params.id, orderService.callerScope(request.authContext))
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, [t('orders.not-found')]);
                return;
            }
            // The body carries what THIS caller may do to the order, so the client renders its
            // controls from the server's answer rather than from a copy of the lifecycle.
            successResponse(response, orderService.withActions(order, request.authContext));
        })
        .catch(catchAs(response, 'getOrderItem'));
};
