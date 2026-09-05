/**
 * @module
 * POST /payments/intent
 * Freeze an order's price into a payment intent, ready to confirm. Thin on purpose: ownership,
 * the `pending` gate and the amount all live in the service — no audit or analytics here, since
 * an intent is a page load's preparation, not a business event; those fire on the confirm.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { CreatePaymentIntentBody } from '@api/schemas.zod';
import { paymentService } from '../service';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `POST /payments/intent`. */
export const postPaymentIntent = (request: Request, response: Response) => {
    const body = parseBody(CreatePaymentIntentBody, request.body, response);
    if (!body) return;

    return paymentService
        .createIntent(body.orderId, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            // A success result for this endpoint always carries the intent; this satisfies the
            // type checker without loosening it.
            if (!result.data) throw new Error('payment intent create succeeded without a payment');
            // `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform.
            successResponse<Payment>(response, result.data.toJSON() as Payment, 201);
        })
        .catch(catchAs(response, 'postPaymentIntent'));
};
