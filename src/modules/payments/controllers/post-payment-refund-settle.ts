/**
 * @module
 * POST /payments/:id/refunds/:refundId/settle
 * An operator confirming that a refund's money went back outside the application. Answers the
 * refund it settled. `create:Refund` at the route, which also carries the fresh-session
 * requirement; the service refuses a refund with no final answer and one someone already settled.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { paymentService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';

/** Handles `POST /payments/:id/refunds/:refundId/settle`. */
export const postPaymentRefundSettle = (
    request: Request<{ id?: string; refundId?: string }>,
    response: Response
) => {
    const paymentId = requireId(request, response, { notFound: 'payments.not-found' });
    if (!paymentId) return;
    const refundId = requireId(request, response, {
        notFound: 'payments.not-found',
        name: 'refundId'
    });
    if (!refundId) return;

    return paymentService
        .settleRefundByHand(paymentId, refundId, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            const refund = paymentService.refundOf(result.data, refundId, request.authContext);
            // Unreachable on a success: the refund that just settled is on the payment.
            if (!refund) throw new Error('a settled refund is missing from its payment');
            successResponse(response, refund, 200);
        })
        .catch(catchAs(response, 'postPaymentRefundSettle'));
};
