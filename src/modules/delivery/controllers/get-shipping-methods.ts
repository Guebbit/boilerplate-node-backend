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

/**
 * Handles `GET /delivery/methods`.
 *
 * No `?weight=` filter: the query string was client-supplied and advisory only, and
 * `PUT /cart/shipping-method` (plus `POST /cart/checkout`) already run the real weight-fit check
 * server-side, against the basket that actually exists. A caller reads the full list here and
 * lets the write endpoints say which of them the basket can actually use.
 */
export const getShippingMethods = (request: Request, response: Response) => {
    const result = deliveryService.listMethods();
    // Always a success (see `listMethods`' own docblock); `data` is always set.
    successResponse<ShippingMethodsResponse>(response, result.data);
};
