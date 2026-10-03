/**
 * @module
 * GET /returns/:id — one return with the caller's `actions`. A return on someone else's order is a
 * 404, the same as one that does not exist.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import type { Return } from '@types';
import { returnService } from '../services';

/** Handles `GET /returns/:id`. */
export const getReturnById = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'returns.not-found' });
    if (!id) return;
    const { authContext } = request;
    // `isAuth` is mounted above this route, so a caller is always present here.
    if (!authContext) return;

    return returnService
        .getReturn(id, authContext)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Return>(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'getReturnById'));
};
