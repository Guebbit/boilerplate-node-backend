/**
 * @module
 * POST /returns/:id/cancel — staff canceling an approved return whose goods never came. Answers
 * 200 with the return as it now stands (`canceled`).
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { CancelReturnBody } from '@api/schemas.zod';
import type { Return } from '@types';
import { returnService } from '../services';

/** Handles `POST /returns/:id/cancel`. */
export const postReturnCancel = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'returns.not-found' });
    if (!id) return;
    // The body is optional: canceling with no note is the common case.
    const body = parseBody(CancelReturnBody, request.body ?? {}, response);
    if (!body) return;
    /* Auth context is guaranteed by isAuth middleware */
    const authContext = request.authContext!;

    return returnService
        .cancelReturn(id, body.note, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Return>(
                response,
                returnService.withActions(result.data, authContext),
                200
            );
        })
        .catch(catchAs(response, 'postReturnCancel'));
};
