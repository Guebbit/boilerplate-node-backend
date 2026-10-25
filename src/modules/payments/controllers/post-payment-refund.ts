/**
 * @module
 * POST /payments/:id/refunds
 * Return a payment's money, all of it or a part, without touching its order's status — the
 * operator's standalone refund. Answers 201 with the new `Refund` record, `Location` naming it.
 * Admin-only at the route; "cancel and refund" is a client sending this and the order cancel,
 * kept separate so an operator can do either one alone.
 */

import type { Request, Response } from 'express';
import { createdResponse } from '@infrastructure/http/response';
import { paymentService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { CreateRefundBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';

/** Handles `POST /payments/:id/refunds`. */
export const postPaymentRefund = (request: Request<{ id?: string }>, response: Response) => {
    const paymentId = requireId(request, response, { notFound: 'payments.not-found' });
    if (!paymentId) return;

    const body = parseBody(CreateRefundBody, request.body ?? {}, response);
    if (!body) return;

    return paymentService
        .refundPayment(paymentId, request.authContext, callerContextOf(request), body)
        .then((result) => {
            if (refused(response, result)) return;
            const { payment, refundId } = result.data;
            const refund = paymentService.refundOf(payment, refundId, request.authContext);
            // Unreachable on a success: the refund that just ran left its record on the payment.
            if (!refund) throw new Error('a successful refund left no record on the payment');
            createdResponse(
                response,
                refund,
                `/payments/${paymentId}/refunds/${refund.id}`,
                result.message
            );
        })
        .catch(catchAs(response, 'postPaymentRefund'));
};
