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
import { readInput } from '@infrastructure/http/request';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { catchAs, parseBody } from '@infrastructure/http/controller';
import { GetOrderTimelineQueryParams } from '@api/schemas.zod';
import type { OrderTimelineResponse } from '@types';

/** The page query: `page`/`pageSize` as the coercing infra pair, both optional (a strict object, so a stray key is a 422). */
const timelineQuerySchema = GetOrderTimelineQueryParams.extend({
    page: pageSchema,
    pageSize: pageSizeSchema
}).partial();

/**
 * GET /orders/:id/timeline — a page of what happened, newest first. Staff see every row and its
 * actor, the buyer only the buyer-visible types and never an actor.
 */
export const getOrderTimeline = (
    request: Request<{ id?: string }>,
    response: Response
): Promise<void> | void => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return;

    // Query params only — a GET has no body. See docs/theory/request-input.md.
    const query = parseBody(timelineQuerySchema, readInput(request, { surface: 'list' }), response);
    if (!query) return;

    return orderService
        .getForCaller(id, request.authContext)
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, [t('orders.not-found')]);
                return undefined;
            }
            return orderService.readTimeline(id, request.authContext, query).then((page) => {
                successResponse<OrderTimelineResponse>(response, page, 200);
            });
        })
        .catch(catchAs(response, 'getOrderTimeline'));
};
