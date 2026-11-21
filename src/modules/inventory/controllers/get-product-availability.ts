/**
 * @module
 * GET /products/:id/availability
 * One product's availability, as the caller may see it.
 */

import type { Request, Response } from 'express';
import type { ProductAvailability } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import { getProductAvailability } from '../services/availability';

/** Handles `GET /products/:id/availability`. */
export const getProductAvailabilityItem = (
    request: Request<{ id?: string }>,
    response: Response
) => {
    const productId = requireId(request, response, { notFound: 'products.not-found' });
    if (!productId) return Promise.resolve();

    return getProductAvailability(productId, request.caller)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<ProductAvailability>(response, result.data);
        })
        .catch(catchAs(response, 'getProductAvailability'));
};
