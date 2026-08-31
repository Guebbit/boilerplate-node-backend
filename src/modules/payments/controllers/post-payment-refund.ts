/**
 * @module
 * POST /payments/order/:orderId/refund
 * Return an order's money without touching its status — the operator's standalone refund.
 *
 * Admin-only at the route. "Cancel and refund" is a client sending this and the order cancel;
 * keeping them separate is what lets an operator do either one alone.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { paymentService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/** Handles `POST /payments/order/:orderId/refund`. */
export const postPaymentRefund = (request: Request<{ orderId?: string }>, response: Response) =>
    paymentService
        .refundByOrder(
            String(request.params.orderId),
            request.authContext,
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postPaymentRefund'));
