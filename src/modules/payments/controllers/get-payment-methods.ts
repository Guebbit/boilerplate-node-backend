/**
 * @module
 * GET /payments/methods
 * The payment methods this shop offers, so the frontend hard-codes none. Public: a guest deciding
 * whether to sign up deserves to know what checkout options exist.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { listPaymentMethods } from '../config';
import type { PaymentMethodsResponse } from '@types';

/** Handles `GET /payments/methods`. */
export const getPaymentMethods = (_request: Request, response: Response) => {
    successResponse<PaymentMethodsResponse>(response, { methods: listPaymentMethods() });
};
