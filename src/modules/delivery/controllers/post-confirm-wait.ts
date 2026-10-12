/**
 * @module
 * POST /delivery/fulfillment-orders/:id/confirm-wait
 * The buyer saying "keep waiting" for a late preorder.
 */

import type { Request, Response } from 'express';
import type { FulfillmentOrder } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `POST /delivery/fulfillment-orders/:id/confirm-wait`. */
export const postConfirmWait = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'delivery.fulfillment-order-not-found' });
    if (!id || !request.authContext) return Promise.resolve();

    return deliveryService
        .confirmWait(id, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<FulfillmentOrder>(response, result.data);
        })
        .catch(catchAs(response, 'postConfirmWait'));
};
