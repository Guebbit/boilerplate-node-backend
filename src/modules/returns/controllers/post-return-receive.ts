/**
 * @module
 * POST /returns/:id/receive — the goods arrived. Puts the units back on sale and pays the customer
 * back; answers 200 with the return as it now stands (`closed` once the money went back, `received`
 * while a refund the provider refused waits for the sweep).
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf, isValidObjectId } from '@infrastructure/http/request';
import { ReceiveReturnBody } from '@api/schemas.zod';
import type { Return } from '@types';
import { returnService } from '../services';

/** Handles `POST /returns/:id/receive`. */
export const postReturnReceive = (request: Request<{ id?: string }>, response: Response) => {
    const { id } = request.params;
    if (!isValidObjectId(id)) {
        rejectResponse(response, 404, [t('returns.not-found')]);
        return;
    }
    // The body is optional: receiving with nothing to deduct is the common case.
    const body = parseBody(ReceiveReturnBody, request.body ?? {}, response);
    if (!body) return;
    const { authContext } = request;
    // `isAuth` is mounted above this route, so a caller is always present here.
    if (!authContext) return;

    return returnService
        .receiveReturn(id, body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Return>(
                response,
                returnService.withActions(result.data, authContext),
                200,
                result.message
            );
        })
        .catch(catchAs(response, 'postReturnReceive'));
};
