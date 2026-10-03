/**
 * @module
 * POST /returns
 * Open a return — and the EU withdrawal button, which is this same call with `reason:
 * withdrawal`. Always a return written (201, `Location`): open once the goods have shipped, closed
 * at birth when a withdrawal reaches the order before dispatch and cancels it.
 */

import type { Request, Response } from 'express';
import type { Return } from '@types';
import { createdResponse, rejectResponse } from '@infrastructure/http/response';
import { catchAs, parseBody } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { CreateReturnBody } from '@api/schemas.zod';
import { t } from '@infrastructure/i18n';
import { returnService } from '../services';

/** Handles `POST /returns`. */
export const postReturn = (request: Request, response: Response) => {
    const body = parseBody(CreateReturnBody, request.body, response);
    if (!body) return;

    const { authContext } = request;
    // `isAuth` is mounted above this route, so a caller is always present here.
    if (!authContext) return;

    return returnService
        .createReturn(body, authContext, callerContextOf(request))
        .then((outcome) => {
            if (outcome.kind === 'refused') {
                rejectResponse(response, outcome.reject.status, outcome.reject.errors);
                return;
            }
            return returnService.withActions(outcome.created, authContext).then((created) => {
                createdResponse<Return>(
                    response,
                    created,
                    `/returns/${created.id}`,
                    // Closed at birth means the withdrawal already cancelled and refunded the order.
                    t(created.status === 'closed' ? 'returns.withdrawn' : 'returns.requested')
                );
            });
        })
        .catch(catchAs(response, 'postReturn'));
};
