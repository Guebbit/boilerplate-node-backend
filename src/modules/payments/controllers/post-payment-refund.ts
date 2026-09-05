/**
 * @module
 * POST /payments/order/:orderId/refund
 * Return an order's money without touching its status — the operator's standalone refund.
 * Admin-only at the route; "cancel and refund" is a client sending this and the order cancel,
 * kept separate so an operator can do either one alone.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
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
            // A success result for this endpoint always carries the refunded payment; this
            // satisfies the type checker without loosening it.
            if (!result.data) throw new Error('payment refund succeeded without a payment');
            // `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform.
            successResponse<Payment>(
                response,
                result.data.toJSON() as Payment,
                200,
                result.message
            );
        })
        .catch(catchAs(response, 'postPaymentRefund'));
