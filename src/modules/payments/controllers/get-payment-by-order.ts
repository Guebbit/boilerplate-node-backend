/**
 * @module
 * GET /payments/order/:orderId
 * The payment behind an order — the order page's payment panel reads this on load, so a reload
 * mid-flow finds the intent (and its status) again instead of starting over.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { paymentService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `GET /payments/order/:orderId`. */
export const getPaymentByOrder = (request: Request<{ orderId?: string }>, response: Response) =>
    paymentService
        .getForOrder(String(request.params.orderId), request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data);
        })
        .catch(catchAs(response, 'getPaymentByOrder'));
