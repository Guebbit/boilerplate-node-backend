/**
 * @module
 * Admin override controller — `POST /orders/:id/status-override`, the status-only door. Thin
 * wiring onto `orderService.overrideStatus`; the route's own `requirePermission('orders.any.override')`
 * has already confirmed the caller holds the (step-up gated) key before this runs.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '../services';
import type { StatusOverrideRequest } from '@types';
import { OverrideOrderStatusBody } from '@api/schemas.zod';
import { rejectResponse } from '@infrastructure/http/response';
import { callerContextOf, isValidObjectId } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { respondWithOrder } from './respond';

/**
 * POST /orders/:id/status-override — force `to`, with `reason`, and no parcel/email consequence.
 */
export const postOrderStatusOverride = (
    request: Request<{ id?: string }, unknown, StatusOverrideRequest>,
    response: Response
): Promise<void> => {
    if (!isValidObjectId(request.params.id)) {
        rejectResponse(response, 404, [t('orders.not-found')]);
        return Promise.resolve();
    }

    const body = parseBody(OverrideOrderStatusBody, request.body, response);
    if (!body) return Promise.resolve();

    return orderService
        .overrideStatus(request.params.id, body.to, body.reason, callerContextOf(request))
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
