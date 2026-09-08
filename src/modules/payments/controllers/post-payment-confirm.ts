/**
 * @module
 * POST /payments/:id/confirm
 * The payment form's submit — where the method the browser tokenised is handed over, so where the
 * events fire. A decline is reported like any refusal (409, `PAYMENT_DECLINED`) but still counted
 * and audited: a support thread about a payment starts with "was it us or the card", and the audit
 * row answers it. An in-flight answer (`requires_action`, `processing`) is a 200 — the browser has
 * a next step, and a 4xx would tell it to stop.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { ConfirmPaymentBody } from '@api/schemas.zod';
import { paymentConfirmTotal } from '../metrics';
import { paymentService } from '../services';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `POST /payments/:id/confirm`. */
export const postPaymentConfirm = (request: Request<{ id?: string }>, response: Response) => {
    const body = parseBody(ConfirmPaymentBody, request.body, response);
    if (!body) return;

    const paymentId = String(request.params.id);
    return paymentService
        .confirmPayment(
            paymentId,
            body.paymentMethodRef,
            request.authContext,
            callerContextOf(request)
        )
        .then((result) => {
            const declined =
                !result.success && result.errors.some(({ code }) => code === 'PAYMENT_DECLINED');
            // Counted outcomes only: not-found/race rejections aren't confirm attempts. In flight
            // is counted as its own label rather than folded into either — a spike in challenges
            // is a different incident from a spike in declines.
            if (result.success)
                paymentConfirmTotal.inc({
                    outcome: result.data?.status === 'succeeded' ? 'succeeded' : 'in_flight'
                });
            else if (declined) paymentConfirmTotal.inc({ outcome: 'declined' });

            if (refused(response, result)) return;
            // A success result for this endpoint always carries the payment; this satisfies the
            // type checker without loosening it.
            if (!result.data) throw new Error('payment confirm succeeded without a payment');
            // `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform.
            successResponse<Payment>(
                response,
                result.data.toJSON() as Payment,
                200,
                result.message
            );
        })
        .catch(catchAs(response, 'postPaymentConfirm'));
};
