/**
 * @module
 * Admin override controller — `POST /orders/:id/status-override`, the status-only door. Thin
 * wiring onto `orderService.overrideStatus`; the route's own `requirePermission('orders.any.override')`
 * has already confirmed the caller holds the (step-up gated) key before this runs.
 */

import type { Request, Response } from 'express';
import { orderService } from '../services';
import type { StatusOverrideRequest } from '@types';
import { OverrideOrderStatusBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { respondWithOrder } from './respond';

/**
 * POST /orders/:id/status-override — force `to`, with `reason`, and no parcel/email consequence.
 */
export const postOrderStatusOverride = (
    request: Request<{ id?: string }, unknown, StatusOverrideRequest>,
    response: Response
): Promise<void> => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return Promise.resolve();

    const body = parseBody(OverrideOrderStatusBody, request.body, response);
    if (!body) return Promise.resolve();

    return orderService
        .overrideStatus(id, body.to, body.reason, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            return respondWithOrder(
                response,
                result.data,
                request.authContext,
                'postOrderStatusOverride'
            );
        })
        .catch(catchAs(response, 'postOrderStatusOverride'));
};
