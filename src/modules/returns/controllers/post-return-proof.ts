/**
 * @module
 * POST /returns/:id/proof-of-sending — staff recording the carrier's proof of sending for an
 * approved return. Answers 200 with the return as it now stands, still `approved`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { RecordProofOfSendingBody } from '@api/schemas.zod';
import type { Return } from '@types';
import { returnService } from '../services';

/** Handles `POST /returns/:id/proof-of-sending`. */
export const postReturnProof = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'returns.not-found' });
    if (!id) return;
    const body = parseBody(RecordProofOfSendingBody, request.body, response);
    if (!body) return;
    /* Auth context is guaranteed by isAuth middleware */
    const authContext = request.authContext!;

    return returnService
        .recordProofOfSending(
            id,
            { ...body, sentAt: new Date(body.sentAt) },
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Return>(
                response,
                returnService.withActions(result.data, authContext),
                200
            );
        })
        .catch(catchAs(response, 'postReturnProof'));
};
