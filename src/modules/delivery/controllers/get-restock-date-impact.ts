/**
 * @module
 * GET /delivery/fulfillment-orders/restock-date-impact — the staff preview of a restock-date move.
 * Query only, no body: `restockDate` absent or blank is a CLEARED date.
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { ReleaseDateImpact } from '@types';
import { PreviewRestockDateImpactQueryParams } from '@api/schemas.zod';
import { readInput } from '@infrastructure/http/request';
import { blankToUndefined } from '@infrastructure/http/schemas';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { productService } from '@modules/products';
import { deliveryService } from '../services';

/** The generated query, with a blank `restockDate` read as absent, i.e. cleared. */
const previewQuerySchema = PreviewRestockDateImpactQueryParams.extend({
    restockDate: z.preprocess(
        blankToUndefined,
        PreviewRestockDateImpactQueryParams.shape.restockDate
    )
});

/** Handles `GET /delivery/fulfillment-orders/restock-date-impact`. */
export const getRestockDateImpact = (request: Request, response: Response) => {
    // Query params only — a GET has no body. See docs/theory/request-input.md.
    const query = parseBody(previewQuerySchema, readInput(request, { surface: 'list' }), response);
    if (!query) return Promise.resolve();

    // The save's own date rules (format, at most a year ahead), so the preview refuses what it refuses.
    const checked = parseBody(
        productService.zodProductUpdateSchema,
        { restockDate: query.restockDate },
        response
    );
    if (!checked) return Promise.resolve();

    return deliveryService
        .previewDateImpact(
            query.productId,
            'backorder',
            query.restockDate === undefined ? undefined : new Date(query.restockDate)
        )
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<ReleaseDateImpact>(response, result.data);
        })
        .catch(catchAs(response, 'getRestockDateImpact'));
};
