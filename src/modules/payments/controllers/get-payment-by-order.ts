/**
 * @module
 * GET /payments/order/:orderId
 * The payment behind an order — the order page's payment panel reads this on load, so a reload
 * mid-flow finds the intent (and its status) again instead of starting over.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { paymentService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `GET /payments/order/:orderId`. */
export const getPaymentByOrder = (request: Request<{ orderId?: string }>, response: Response) => {
    const orderId = requireId(request, response, {
        notFound: 'payments.not-found',
        name: 'orderId'
    });
    if (!orderId) return Promise.resolve();

    return paymentService
        .getForOrder(orderId, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Payment>(response, result.data);
        })
        .catch(catchAs(response, 'getPaymentByOrder'));
};
