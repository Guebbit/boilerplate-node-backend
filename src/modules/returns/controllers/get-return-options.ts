/**
 * @module
 * GET /returns/options?orderId= — what an order can still send back and still cancel, with the
 * refund each cancel would owe. The server computes; the client shows.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { GetReturnOptionsQueryParams } from '@api/schemas.zod';
import type { ReturnOptions } from '@types';
import { returnService } from '../services';

/** Handles `GET /returns/options`. */
export const getReturnOptions = (request: Request, response: Response) => {
    const parsed = parseBody(GetReturnOptionsQueryParams, request.query, response);
    if (!parsed) return;

    /* Auth context is guaranteed by isAuth middleware */
    const authContext = request.authContext!;

    return returnService
        .getReturnOptions(parsed.orderId, authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<ReturnOptions>(response, result.data);
        })
        .catch(catchAs(response, 'getReturnOptions'));
};
