import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { readInput } from '@infrastructure/http/request';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListStockMovementsQueryParams } from '@api/schemas.zod';
import { inventoryService } from '../service';
import { catchAs, rejectValidation } from '@infrastructure/http/controller';

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
    // `list`, not `search`: a GET with no body-carrying sibling, so the query is the only source.
    const input = readInput(request, { surface: 'list', ids: ['productId'] });

    const parseResult = movementsQuerySchema.safeParse(input);
    if (!parseResult.success) {
        rejectValidation(response, parseResult.error);
        return Promise.resolve();
    }

    return inventoryService
        .listMovements(parseResult.data)
        .then((result) => {
            successResponse(response, result.data);
        })
        .catch(catchAs(response, 'getStockMovements'));
};
