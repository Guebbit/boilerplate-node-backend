/**
 * @module
 * GET /returns/:id — one return with the caller's `actions`. A return on someone else's order is a
 * 404, the same as one that does not exist.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import { isValidObjectId } from '@infrastructure/http/request';
import type { Return } from '@types';
import { returnService } from '../services';

/** Handles `GET /returns/:id`. */
export const getReturnById = (request: Request<{ id?: string }>, response: Response) => {
    const { id } = request.params;
    if (!isValidObjectId(id)) {
        rejectResponse(response, 404, [t('returns.not-found')]);
        return;
    }
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
