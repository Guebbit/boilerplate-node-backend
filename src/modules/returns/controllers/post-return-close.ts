/**
 * @module
 * POST /returns/:id/close — staff finishing a received return by hand. Answers 200 with the
 * return as it now stands (`closed`).
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { CloseReturnBody } from '@api/schemas.zod';
import type { Return } from '@types';
import { returnService } from '../services';

/** Handles `POST /returns/:id/close`. */
export const postReturnClose = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'returns.not-found' });
    if (!id) return;
    // The body is optional: closing with no note is the common case.
    const body = parseBody(CloseReturnBody, request.body ?? {}, response);
    if (!body) return;
    /* Auth context is guaranteed by isAuth middleware */
    const authContext = request.authContext!;

    return returnService
        .closeReturnByHand(id, body.note, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Return>(
                response,
                returnService.withActions(result.data, authContext),
                200
            );
        })
        .catch(catchAs(response, 'postReturnClose'));
};
