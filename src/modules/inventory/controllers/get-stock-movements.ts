import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readInput } from '@infrastructure/http/request';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListStockMovementsQueryParams } from '@api/schemas.zod';
import { inventoryService } from '../service';

/**
 * The generated query schema with the two pagination fields relaxed to accept query-string text.
 *
 * `page`/`pageSize` come from `@infrastructure/http/schemas` so every paged endpoint agrees on
 * what a legal one is; absent stays absent, because `normalizePagination` owns the defaults.
 */
const movementsQuerySchema = ListStockMovementsQueryParams.extend({
    page: pageSchema,
    pageSize: pageSizeSchema
}).partial();

/**
 * GET /inventory/movements
 * A page of the ledger, newest first, narrowed by `productId` and `reason`.
 */
export const getStockMovements = (request: Request, response: Response) => {
    // One declaration instead of a per-field assembly — see docs/theory/request-input.md.
    const input = readInput(request, { surface: 'search', ids: ['productId'] });

    const parseResult = movementsQuerySchema.safeParse(input);
    if (!parseResult.success) {
        rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );
        return Promise.resolve();
    }

    return inventoryService
        .listMovements(parseResult.data)
        .then((result) => {
            successResponse(response, result.data);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'getStockMovements', error);
        });
};
