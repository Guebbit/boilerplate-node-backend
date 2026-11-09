/**
 * @module
 * POST /orders/:id/process
 * Staff reporting that fulfillment has started on a paid order — the one door that moves an order
 * `paid → processing`, before any parcel exists to record.
 */

import type { Request, Response } from 'express';
import type { Order } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { answerAsResource } from '@infrastructure/http/preconditions';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { deliveryService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `POST /orders/:id/process`. */
export const postProcessOrder = (request: Request<{ id?: string }>, response: Response) => {
    const orderId = requireId(request, response, {
        notFound: 'delivery.order-not-found'
    });
    if (!orderId) return Promise.resolve();

    return deliveryService
        .processOrder(orderId, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            // The order's real tag, and the resource it belongs to (RFC 9110 §8.8.3).
            answerAsResource(response, result.data, `/orders/${result.data.id}`);
            successResponse<Order>(response, result.data);
        })
        .catch(catchAs(response, 'postProcessOrder'));
};
