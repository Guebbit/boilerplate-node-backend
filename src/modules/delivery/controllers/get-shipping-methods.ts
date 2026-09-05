/**
 * @module
 * GET /delivery/methods
 * The shipping methods this shop offers, flat rates and free-above thresholds included. Public:
 * a guest deciding whether to sign up deserves to know what shipping costs.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { deliveryService } from '../service';
import type { ShippingMethodsResponse } from '@types';

/** Handles `GET /delivery/methods`. */
export const getShippingMethods = (_request: Request, response: Response) => {
    const result = deliveryService.listMethods();
    // Always a success (see `listMethods`' own docblock); `data` is always set.
    successResponse<ShippingMethodsResponse>(response, result.data!);
};
