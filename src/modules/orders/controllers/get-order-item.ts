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
 * GET /orders/:id — single order by path id; non-admin callers see only their own.
 *
 * The id is checked BEFORE the query, unlike other single-item reads that let the query fail and
 * map the error in `.catch`. Here the two role branches raise different error classes for the same
 * malformed id — `findById`'s `CastError` vs the scoped aggregate's `BSONError` (422) — so checking
 * post-query would make the status depend on who asked. Checking first keeps the answer at 404
 * regardless of role.
 */
export const getOrderItem = (request: Request<{ id?: string }>, response: Response) => {
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
            successResponse(response, orderService.withActions(order, request.authContext));
        })
        .catch(catchAs(response, 'getOrderItem'));
};
