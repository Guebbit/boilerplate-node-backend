/**
 * @module
 * POST /returns/:id/approve and POST /returns/:id/decline — staff's answer to a return request.
 * Both are POST actions answering 200 with the return as it now stands.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf, isValidObjectId } from '@infrastructure/http/request';
import { DeclineReturnBody } from '@api/schemas.zod';
import type { Return } from '@types';
import { returnService } from '../services';

/** Handles `POST /returns/:id/approve`. */
export const postReturnApprove = (request: Request<{ id?: string }>, response: Response) => {
    const { id } = request.params;
    if (!isValidObjectId(id)) {
        rejectResponse(response, 404, [t('returns.not-found')]);
        return;
    }
    const { authContext } = request;
    // `isAuth` is mounted above this route, so a caller is always present here.
    if (!authContext) return;

    return returnService
        .approveReturn(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Return>(
                response,
                returnService.withActions(result.data, authContext),
                200,
                result.message
            );
        })
        .catch(catchAs(response, 'postReturnApprove'));
};

/** Handles `POST /returns/:id/decline`. */
export const postReturnDecline = (request: Request<{ id?: string }>, response: Response) => {
    const { id } = request.params;
    if (!isValidObjectId(id)) {
        rejectResponse(response, 404, [t('returns.not-found')]);
        return;
    }
    const body = parseBody(DeclineReturnBody, request.body, response);
    if (!body) return;
    const { authContext } = request;
    // `isAuth` is mounted above this route, so a caller is always present here.
    if (!authContext) return;

    return returnService
        .declineReturn(id, body.reason, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Return>(
                response,
                returnService.withActions(result.data, authContext),
                200,
                result.message
            );
        })
        .catch(catchAs(response, 'postReturnDecline'));
};
