/**
 * @module
 * GET /payments/order-by-reference
 * The admin's own step before `POST /payments/order/:orderId/offline`: paste the RF code read off
 * the bank's website, get back the order it pays. Same authority as that endpoint — reading who
 * owes what by reference is no less than recording that it arrived.
 */

import type { Request, Response } from 'express';
import type { Order } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { paymentService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `GET /payments/order-by-reference`. */
export const getOrderByReference = (
    request: Request<unknown, unknown, unknown, { ref?: string }>,
    response: Response
) =>
    paymentService
        .getOrderByReference(request.query.ref ?? '')
        .then((result) => {
            if (refused(response, result)) return;
            // A success result for this endpoint always carries the order; this satisfies the
            // type checker without loosening it.
            if (!result.data) throw new Error('reference lookup succeeded without an order');
            successResponse<Order>(response, result.data.toJSON() as Order);
        })
        .catch(catchAs(response, 'getOrderByReference'));
