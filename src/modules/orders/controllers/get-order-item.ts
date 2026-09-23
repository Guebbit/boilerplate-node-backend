/**
 * @module
 * Single-order read controller, scoped by caller role; see the exported controller's own JSDoc
 * for the 404-vs-422 distinction this file enforces before the query runs.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { isValidObjectId } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';
import type { Order } from '@types';

/**
 * GET /orders/:id — single order by path id; non-admin callers see only their own.
 *
 * The id is checked BEFORE the query, unlike other single-item reads that let the query fail and
 * map the error in `.catch`: a malformed id rejects with a `BSONError`, which `.catch`'s
 * `databaseErrorInterpreter` reads as 422 — a shape complaint, not the 404 a lookup by id should
 * give regardless of whether the id merely doesn't exist or was never well-formed to begin with.
 */
export const getOrderItem = (
    request: Request<{ id?: string }>,
    response: Response
): Promise<void> | void => {
    if (!isValidObjectId(request.params.id)) {
        rejectResponse(response, 404, [t('orders.not-found')]);
        return;
    }

    return orderService
        .getById(request.params.id, orderService.callerScope(request.authContext))
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, [t('orders.not-found')]);
                return;
            }
            // The body carries what THIS caller may do to the order, so the client renders its
            // controls from the server's answer rather than from a copy of the lifecycle.
            return orderService.withActions(order, request.authContext).then((resolved) => {
                successResponse<Order>(response, resolved);
            });
        })
        .catch(catchAs(response, 'getOrderItem'));
};
