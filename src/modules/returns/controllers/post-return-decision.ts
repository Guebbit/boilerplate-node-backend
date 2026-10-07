/**
 * @module
 * POST /returns/:id/approve and POST /returns/:id/decline — staff's answer to a return request.
 * Both are POST actions answering 200 with the return as it now stands.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { DeclineReturnBody } from '@api/schemas.zod';
import type { Return } from '@types';
import { returnService } from '../services';

/** Handles `POST /returns/:id/approve`. */
export const postReturnApprove = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'returns.not-found' });
    if (!id) return;
    /* Auth context is guaranteed by isAuth middleware */
    const authContext = request.authContext!;

    return returnService
        .approveReturn(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return returnService.withActions(result.data, authContext).then((payload) => {
                successResponse<Return>(response, payload, 200, result.message);
            });
        })
        .catch(catchAs(response, 'postReturnApprove'));
};

/** Handles `POST /returns/:id/decline`. */
export const postReturnDecline = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'returns.not-found' });
    if (!id) return;
    const body = parseBody(DeclineReturnBody, request.body, response);
    if (!body) return;
    /* Auth context is guaranteed by isAuth middleware */
    const authContext = request.authContext!;

    return returnService
        .declineReturn(id, body.reason, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return returnService.withActions(result.data, authContext).then((payload) => {
                successResponse<Return>(response, payload, 200, result.message);
            });
        })
        .catch(catchAs(response, 'postReturnDecline'));
};
