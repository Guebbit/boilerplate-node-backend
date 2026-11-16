/**
 * @module
 * GET /payments/attention — what still needs a person: stale, refused, reversed and
 * over-refunded refunds, refunds owed by hand, and open disputes.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { paymentService } from '../services';

/** Handles `GET /payments/attention`. */
export const getPaymentAttention = (_request: Request, response: Response) =>
    paymentService
        .listAttention()
        .then((result) => {
            successResponse(response, result);
        })
        .catch(catchAs(response, 'getPaymentAttention'));
