/**
 * @module
 * GET /returns — a page of returns. Staff see every one; anyone else sees the returns on their own
 * orders. The scoping is the service's, decided from the caller — never from a query parameter.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, rejectValidation } from '@infrastructure/http/controller';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListReturnsQueryParams } from '@api/schemas.zod';
import { returnService } from '../services';

/** The generated query schema, with `page`/`pageSize` coerced from the strings a query string carries. */
const listReturnsQuerySchema = ListReturnsQueryParams.extend({
    page: pageSchema,
    pageSize: pageSizeSchema
});

/** Handles `GET /returns`. */
export const getReturns = (request: Request, response: Response) => {
    const parsed = listReturnsQuerySchema.safeParse(request.query);
    if (!parsed.success) return rejectValidation(response, parsed.error);

    const { authContext } = request;
    // `isAuth` is mounted above this route, so a caller is always present here.
    if (!authContext) return;

    return returnService
        .listReturns(parsed.data, authContext)
        .then((page) => {
            successResponse(response, page);
        })
        .catch(catchAs(response, 'getReturns'));
};
