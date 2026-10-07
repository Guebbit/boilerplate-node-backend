/**
 * @module
 * POST /returns/:id/receive — the goods arrived. Puts the units back on sale and pays the customer
 * back; answers 200 with the return as it now stands (`closed` once the money went back, `received`
 * while a refund the provider refused waits for the sweep).
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { ReceiveReturnBody } from '@api/schemas.zod';
import type { Return } from '@types';
import { returnService } from '../services';

/** Handles `POST /returns/:id/receive`. */
export const postReturnReceive = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'returns.not-found' });
    if (!id) return;
    // The body is optional: receiving with nothing to deduct is the common case.
    const body = parseBody(ReceiveReturnBody, request.body ?? {}, response);
    if (!body) return;
    /* Auth context is guaranteed by isAuth middleware */
    const authContext = request.authContext!;

    return returnService
        .receiveReturn(id, body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return returnService.withActions(result.data, authContext).then((payload) => {
                successResponse<Return>(response, payload, 200, result.message);
            });
        })
        .catch(catchAs(response, 'postReturnReceive'));
};
