/**
 * @module
 * GET /delivery/methods
 * The shipping methods this shop offers, flat rates and free-above thresholds included. Public:
 * a guest deciding whether to sign up deserves to know what shipping costs.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { weightSchema } from '@infrastructure/http/schemas';
import { deliveryService } from '../service';
import type { ShippingMethodsResponse } from '@types';

/** Handles `GET /delivery/methods`. */
export const getShippingMethods = (
    request: Request<unknown, unknown, unknown, { weight?: string }>,
    response: Response
) => {
    // `weightSchema` already answers `undefined` for a missing/blank value — no 422 branch
    // needed, unlike a required scalar: an unparseable `weight` (non-numeric, negative) falls
    // back to "no filter" rather than refusing the whole request, since this list is advisory
    // only (see the endpoint's own contract description).
    const weight = weightSchema.safeParse(request.query.weight).data;
    const result = deliveryService.listMethods(weight);
    // Always a success (see `listMethods`' own docblock); `data` is always set.
    successResponse<ShippingMethodsResponse>(response, result.data);
};
