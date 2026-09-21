/**
 * @module
 * GET /payments/order-by-reference
 * The admin's own step before `POST /payments/order/:orderId/offline`: paste the RF code read off
 * the bank's website, get back the order it pays. Same authority as that endpoint — reading who
 * owes what by reference is no less than recording that it arrived.
 */

import type { Request, Response } from 'express';
import type { Order } from '@types';
import { GetOrderByReferenceQueryParams } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { orderService } from '@modules/orders';
import { paymentService } from '../services';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';

/** Handles `GET /payments/order-by-reference`. */
export const getOrderByReference = (
    request: Request<unknown, unknown, unknown, { ref?: string }>,
    response: Response
) => {
    // The contract's own bounds on `ref`, so a missing or oversized one answers 422 rather than
    // reaching the mod-97 check and coming back as a plain 404.
    const parsed = GetOrderByReferenceQueryParams.safeParse(request.query);
    if (!parsed.success) return rejectValidation(response, parsed.error);

    return paymentService
        .getOrderByReference(parsed.data.ref)
        .then((result) => {
            if (refused(response, result)) return;
            // `withActions` is what every `orders` read puts on the wire: the lines' `current`
            // images resolved, and the actions this caller may take next — which is the whole
            // point here, since `refund`/`cancel` is where the admin goes from this screen.
            return orderService
                .withActions(result.data, request.authContext)
                .then((order) => successResponse<Order>(response, order));
        })
        .catch(catchAs(response, 'getOrderByReference'));
};
