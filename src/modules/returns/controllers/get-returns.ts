/**
 * @module
 * GET /returns — a page of returns. Staff see every one; anyone else sees the returns on their own
 * orders. The scoping is the service's, decided from the caller — never from a query parameter.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody } from '@infrastructure/http/controller';
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
    const parsed = parseBody(listReturnsQuerySchema, request.query, response);
    if (!parsed) return;

    /* Auth context is guaranteed by isAuth middleware */
    const authContext = request.authContext!;

    return returnService
        .listReturns(parsed, authContext)
        .then((page) => {
            successResponse(response, page);
        })
        .catch(catchAs(response, 'getReturns'));
};
