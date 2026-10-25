/**
 * @module
 * GET /orders/:id/payments
 * The payments of an order — the order page's payment panel reads this on load, so a reload
 * mid-flow finds the intent (and its status) again instead of starting over. `{ items: [] }` for
 * an order nobody has started paying; 404 only for an order the caller cannot see.
 */

import type { Request, Response } from 'express';
import type { OrderPaymentsResponse } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { paymentService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `GET /orders/:id/payments`. */
export const getOrderPayments = (request: Request<{ id?: string }>, response: Response) => {
    const orderId = requireId(request, response, { notFound: 'orders.not-found' });
    if (!orderId) return Promise.resolve();

    return paymentService
        .listForOrder(orderId, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<OrderPaymentsResponse>(response, result.data);
        })
        .catch(catchAs(response, 'getOrderPayments'));
};
