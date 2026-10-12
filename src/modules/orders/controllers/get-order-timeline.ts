/**
 * @module
 * GET /orders/:id/timeline — what happened to an order, as the caller may read it. The order is
 * reached through the same scope as `GET /orders/:id`, so an order the caller cannot see answers
 * the same 404 here.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '../services';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { catchAs } from '@infrastructure/http/controller';
import type { OrderTimelineEntry } from '@types';

/**
 * GET /orders/:id/timeline — staff see every row and its actor, the buyer only the buyer-visible
 * types and never an actor.
 */
export const getOrderTimeline = (
    request: Request<{ id?: string }>,
    response: Response
): Promise<void> | void => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return;

    return orderService
        .getForCaller(id, request.authContext)
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, [t('orders.not-found')]);
                return undefined;
            }
            return orderService.readTimeline(id, request.authContext).then((entries) => {
                successResponse<OrderTimelineEntry[]>(response, entries, 200);
            });
        })
        .catch(catchAs(response, 'getOrderTimeline'));
};
