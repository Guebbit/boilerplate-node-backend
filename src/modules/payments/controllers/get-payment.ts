/**
 * @module
 * GET /payments/:id
 * One payment by its own id: where `Location` points after `POST /payments`, and the read the
 * operator-refund answer sends a client back to.
 */

import type { Request, Response } from 'express';
import type { Payment } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { paymentService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/** Handles `GET /payments/:id`. */
export const getPayment = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'payments.not-found' });
    if (!id) return Promise.resolve();

    return paymentService
        .getById(id, request.authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Payment>(response, result.data);
        })
        .catch(catchAs(response, 'getPayment'));
};
