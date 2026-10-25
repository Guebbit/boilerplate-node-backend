/**
 * @module
 * GET /payments/:id/refunds/:refundId
 * One refund record, addressed through its payment: where `Location` points after
 * `POST /payments/:id/refunds`.
 */

import type { Request, Response } from 'express';
import type { Refund } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { paymentService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `GET /payments/:id/refunds/:refundId`. */
export const getRefund = (
    request: Request<{ id?: string; refundId?: string }>,
    response: Response
) => {
    const paymentId = requireId(request, response, { notFound: 'payments.not-found' });
    if (!paymentId) return Promise.resolve();
    // The same answer as an unknown refund: the id is only ever read through its payment.
    const refundId = requireId(request, response, {
        notFound: 'payments.not-found',
        name: 'refundId'
    });
    if (!refundId) return Promise.resolve();

    return paymentService
        .getRefund(paymentId, refundId, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Refund>(response, result.data);
        })
        .catch(catchAs(response, 'getRefund'));
};
