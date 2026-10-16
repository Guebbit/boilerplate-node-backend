/**
 * @module
 * POST /returns
 * Open a return — and the EU withdrawal button, which is this same call with `reason:
 * withdrawal`. Always a return written (201, `Location`): open once the goods have shipped, closed
 * at birth when a withdrawal reaches the order before dispatch and cancels it.
 */

import type { Request, Response } from 'express';
import type { Return } from '@types';
import { createdResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { CreateReturnBody } from '@api/schemas.zod';
import { returnService } from '../services';

/** Handles `POST /returns`. */
export const postReturn = (request: Request, response: Response) => {
    const body = parseBody(CreateReturnBody, request.body, response);
    if (!body) return;

    /* Auth context is guaranteed by isAuth middleware */
    const authContext = request.authContext!;

    return returnService
        .createReturn(body, authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            const created = returnService.withActions(result.data, authContext);
            createdResponse<Return>(response, created, `/returns/${created.id}`, result.message);
        })
        .catch(catchAs(response, 'postReturn'));
};
