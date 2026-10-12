/**
 * @module
 * POST /delivery/fulfillment-orders/:id/hold and /release
 * Staff holding a fulfillment order back, and letting it go.
 */

import type { Request, Response } from 'express';
import type { FulfillmentOrder } from '@types';
import { HoldFulfillmentOrderBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `POST /delivery/fulfillment-orders/:id/hold`. */
export const postHoldFulfillmentOrder = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'delivery.fulfillment-order-not-found' });
    if (!id) return Promise.resolve();

    const body = parseBody(HoldFulfillmentOrderBody, request.body, response);
    if (!body) return Promise.resolve();

    return deliveryService
        .holdFulfillmentOrder(id, body, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<FulfillmentOrder>(response, result.data);
        })
        .catch(catchAs(response, 'postHoldFulfillmentOrder'));
};

/** Handles `POST /delivery/fulfillment-orders/:id/release`. */
export const postReleaseFulfillmentOrder = (
    request: Request<{ id?: string }>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'delivery.fulfillment-order-not-found' });
    if (!id) return Promise.resolve();

    return deliveryService
        .releaseFulfillmentOrder(id, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<FulfillmentOrder>(response, result.data);
        })
        .catch(catchAs(response, 'postReleaseFulfillmentOrder'));
};
