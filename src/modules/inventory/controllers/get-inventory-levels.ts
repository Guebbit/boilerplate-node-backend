import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readInput } from '@infrastructure/http/request';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListInventoryLevelsQueryParams } from '@api/schemas.zod';
import { inventoryService } from '../service';

/**
 * The generated query schema, relaxed to accept what a query string can carry.
 *
 * `page`/`pageSize` come from `@infrastructure/http/schemas` so every paged endpoint agrees on
 * what a legal one is; absent stays absent, because `normalizePagination` owns the defaults.
 */
const levelsQuerySchema = ListInventoryLevelsQueryParams.extend({
    page: pageSchema,
    pageSize: pageSizeSchema
}).partial();

/**
 * GET /inventory/levels
 * A page of the stock board — both counters and availability, scarcest first.
 */
export const getInventoryLevels = (request: Request, response: Response) => {
    // One declaration instead of a per-field assembly — see docs/theory/request-input.md.
    // `lowOnly` is a boolean the query string can only carry as text.
    const input = readInput(request, { surface: 'search', booleans: ['lowOnly'] });

    const parseResult = levelsQuerySchema.safeParse(input);
    if (!parseResult.success) {
        rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );
        return Promise.resolve();
    }

    return inventoryService
        .listLevels(parseResult.data)
        .then((result) => {
            successResponse(response, result.data);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'getInventoryLevels', error);
        });
};
