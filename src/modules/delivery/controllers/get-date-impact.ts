/**
 * @module
 * GET /delivery/fulfillment-orders/{release,restock}-date-impact — the staff previews of a date move.
 * Query only, no body: the date absent or blank is a CLEARED date.
 */

import type { z } from 'zod';
import type { Request, Response } from 'express';
import type { ReleaseDateImpact } from '@types';
import {
    PreviewReleaseDateImpactQueryParams,
    PreviewRestockDateImpactQueryParams
} from '@api/schemas.zod';
import { readInput } from '@infrastructure/http/request';
import { blankToUndefined } from '@infrastructure/http/schemas';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { productService } from '@modules/products';
import { deliveryService } from '../services';

/**
 * One preview handler, parameterised by the date it moves.
 * @param field the query field (and product field) carrying the date
 * @param cause what the date gates, passed to the impact preview
 * @param schema the generated query for that endpoint
 * @param name the handler name, for the error log
 */
const dateImpactController =
    <TField extends 'releaseDate' | 'restockDate'>(
        field: TField,
        cause: 'preorder' | 'backorder',
        schema: z.ZodType<{ productId: string } & Partial<Record<TField, string>>>,
        name: string
    ) =>
    (request: Request, response: Response) => {
        // Query params only — a GET has no body. See docs/theory/request-input.md.
        const input = readInput(request, { surface: 'list' });
        // A blank date is read as absent, i.e. cleared, before the generated query sees it.
        const query = parseBody(
            schema,
            { ...input, [field]: blankToUndefined(input[field]) },
            response
        );
        if (!query) return Promise.resolve();

        const date = query[field];
        // The save's own date rules (format, at most a year ahead), so the preview refuses what it refuses.
        const checked = parseBody(
            productService.zodProductUpdateSchema,
            { [field]: date },
            response
        );
        if (!checked) return Promise.resolve();

        return deliveryService
            .previewDateImpact(
                query.productId,
                cause,
                date === undefined ? undefined : new Date(date)
            )
            .then((result) => {
                if (refused(response, result)) return;
                successResponse<ReleaseDateImpact>(response, result.data);
            })
            .catch(catchAs(response, name));
    };

/** Handles `GET /delivery/fulfillment-orders/release-date-impact`. */
export const getReleaseDateImpact = dateImpactController(
    'releaseDate',
    'preorder',
    PreviewReleaseDateImpactQueryParams,
    'getReleaseDateImpact'
);

/** Handles `GET /delivery/fulfillment-orders/restock-date-impact`. */
export const getRestockDateImpact = dateImpactController(
    'restockDate',
    'backorder',
    PreviewRestockDateImpactQueryParams,
    'getRestockDateImpact'
);
