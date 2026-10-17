/**
 * @module
 * GET /delivery/fulfillment-orders/release-date-impact — the staff preview of a release-date move.
 * Query only, no body: `releaseDate` absent or blank is a CLEARED date.
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { ReleaseDateImpact } from '@types';
import { PreviewReleaseDateImpactQueryParams } from '@api/schemas.zod';
import { readInput } from '@infrastructure/http/request';
import { blankToUndefined } from '@infrastructure/http/schemas';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { productService } from '@modules/products';
import { deliveryService } from '../services';

/** The generated query, with a blank `releaseDate` read as absent, i.e. cleared. */
const previewQuerySchema = PreviewReleaseDateImpactQueryParams.extend({
    releaseDate: z.preprocess(
        blankToUndefined,
        PreviewReleaseDateImpactQueryParams.shape.releaseDate
    )
});

/** Handles `GET /delivery/fulfillment-orders/release-date-impact`. */
export const getReleaseDateImpact = (request: Request, response: Response) => {
    // Query params only — a GET has no body. See docs/theory/request-input.md.
    const query = parseBody(previewQuerySchema, readInput(request, { surface: 'list' }), response);
    if (!query) return Promise.resolve();

    // The save's own date rules (format, at most a year ahead), so the preview refuses what it refuses.
    const checked = parseBody(
        productService.zodProductUpdateSchema,
        { releaseDate: query.releaseDate },
        response
    );
    if (!checked) return Promise.resolve();

    return deliveryService
        .previewReleaseDateImpact(
            query.productId,
            query.releaseDate === undefined ? undefined : new Date(query.releaseDate)
        )
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<ReleaseDateImpact>(response, result.data);
        })
        .catch(catchAs(response, 'getReleaseDateImpact'));
};
