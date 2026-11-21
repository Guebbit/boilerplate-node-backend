/**
 * @module
 * GET /products/availability?id=a&id=b
 * Many products' availability in one call, as the caller may see it.
 */

import type { Request, Response } from 'express';
import type { ProductAvailabilityResponse } from '@types';
import { ListProductAvailabilityQueryParams } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { readInput } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { listProductAvailability } from '../services/availability';

/** Handles `GET /products/availability`. */
export const listProductAvailabilityItems = (request: Request, response: Response) => {
    // `id` repeats (`?id=a&id=b`); `stringArrays` keeps every one instead of the first.
    const query = parseBody(
        ListProductAvailabilityQueryParams,
        readInput(request, { surface: 'list', stringArrays: ['id'] }),
        response
    );
    if (!query) return Promise.resolve();

    return listProductAvailability(query.id ?? [], request.caller)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<ProductAvailabilityResponse>(response, result.data);
        })
        .catch(catchAs(response, 'listProductAvailability'));
};
