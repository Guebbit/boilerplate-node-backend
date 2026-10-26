/**
 * @module
 * POST /payments/:id/refunds/:refundId/cancel
 * Staff voiding a refund that must never be paid. Answers the refund it voided. `create:Refund` at
 * the route, which also carries the fresh-session requirement; the service refuses a refund that
 * is closed already and one that may have moved money.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { paymentService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { CancelRefundBody } from '@api/schemas.zod';

/** Handles `POST /payments/:id/refunds/:refundId/cancel`. */
export const postPaymentRefundCancel = (
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
    const body = parseBody(CancelRefundBody, request.body, response);
    if (!body) return;

    return paymentService
        .cancelRefund(paymentId, refundId, body.note, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            const refund = paymentService.refundOf(result.data, refundId, request.authContext);
            // Unreachable on a success: the refund that was just voided is on the payment.
            if (!refund) throw new Error('a canceled refund is missing from its payment');
            successResponse(response, refund, 200);
        })
        .catch(catchAs(response, 'postPaymentRefundCancel'));
};
