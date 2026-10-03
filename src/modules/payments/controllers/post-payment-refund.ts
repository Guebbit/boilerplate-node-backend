/**
 * @module
 * POST /payments/order/:orderId/refund
 * Return an order's money, all of it or a part, without touching its status — the operator's
 * standalone refund.
 * Admin-only at the route; "cancel and refund" is a client sending this and the order cancel,
 * kept separate so an operator can do either one alone.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { paymentService } from '../services';
import { presentPayment } from '../presenter';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { RefundPaymentByOrderBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';

/** Handles `POST /payments/order/:orderId/refund`. */
export const postPaymentRefund = (request: Request<{ orderId?: string }>, response: Response) => {
    const orderId = requireId(request, response, {
        notFound: 'payments.not-found',
        name: 'orderId'
    });
    if (!orderId) return;

    const body = parseBody(RefundPaymentByOrderBody, request.body ?? {}, response);
    if (!body) return;

    return paymentService
        .refundByOrder(orderId, request.authContext, callerContextOf(request), body)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Payment>(response, presentPayment(result.data), 200, result.message);
        })
        .catch(catchAs(response, 'postPaymentRefund'));
};
